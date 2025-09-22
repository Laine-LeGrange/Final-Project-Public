# Import standard libraries
from __future__ import annotations
import json
from dataclasses import dataclass
from typing import List, Optional, Literal, Dict, Any

# Import tech stack libraries
from pydantic import BaseModel, Field, ValidationError
from supabase import Client
from langchain_core.documents import Document

# Import internal modules
from ..settings import load_config
from ..providers.llms import get_llm, coerce_content_to_text
from ..providers.embeddings import build_embeddings
from ..vector_store.supabase_vs import build_supabase_vectorstore, SupabaseRPCVectorStore
from ..providers.rerankers import build_reranker
from ..retrieval.rerank import rerank as apply_rerank
from ..retrieval.retrievers import retrieve_with_expansion

# Pydantic models for quiz schema
class QuizOption(BaseModel):
    option_id: str
    text: str
    is_correct: bool

# Quiz question model
class QuizQuestion(BaseModel):
    prompt: str
    options: List[QuizOption] = Field(..., min_length=2, max_length=4)  

# Quiz packet model
class QuizPacket(BaseModel):
    questions: List[QuizQuestion] = Field(..., min_length=1)


# -------------------------------- Helpers -------------------------------------

# Build the vector store
def build_vec_store() -> SupabaseRPCVectorStore:
    """Build the vector store using factory + embeddings config."""
    cfg = load_config()
    emb = build_embeddings(**cfg["embeddings"])
    return build_supabase_vectorstore(emb)


# Format the context for the prompt
def format_summ_context(docs: List[Document], max_chars: int = 50000) -> str:
    """Format context for the prompt            .
    Truncates to keep within decent token budget."""
    parts: List[str] = []
    used = 0

    # Iterate through documents and add to context until max_chars is reached
    for i, d in enumerate(docs, start=1):
        content = d.page_content if isinstance(d, Document) else (d.get("content") or d.get("page_content") or "")
        chunk = (content or "").strip()
        if not chunk:
            continue
        header = f"[CTX {i}]\n"
        # Truncate chunk if it exceeds budget
        budget_left = max_chars - used - len(header)
        if budget_left <= 0:
            break
        if len(chunk) > budget_left:
            chunk = chunk[:budget_left]

        # Add header and chunk to parts
        parts.append(header + chunk)
        used += len(header) + len(chunk)
    
    # Join parts with double newlines and return
    return "\n\n".join(parts)

# ----------------- System and User Prompts --------------------
# System instructions
SYSTEM_BASE = (
    "You are a meticulous quiz author. You create multiple choice questions grounded strictly in the provided study context. "
    "Avoid trivia outside of the context. Questions must be unambiguous, single-correct."
)

# 'User' instructions - with placeholders
USER_INSTRUCTIONS = (
    "Create {count} {difficulty} questions for a study quiz.\n"
    "Each question must have exactly 4 options labeled A, B, C, D.\n"
    "Exactly one option has is_correct=true. Ensure that the correct option is randomly positioned in the final JSON, and not always the same label like Bs\n"
    "Base questions only on the CONTEXT snippets.\n"
    "Return pure JSON matching this schema: {schema}. No prose."
)


# ------------------------ Core API --------------------------------
# Data class for quiz generation parameters
@dataclass
class QuizGenParams:
    topic_id: str
    quiz_id: str
    user_id: str
    scope: Optional[str]
    count: int = 10
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    mode: Literal["multiquery", "hyde", "both"] = "multiquery"
    expansions: int = 4 
    hyde_n: int = 2 
    fetch_k: int = 20
    top_k_after_rerank: int = 12
    reranker_provider: Optional[str] = None  # "flashrank" | "cohere" | "bge" | None
    reranker_model: Optional[str] = None

# ------------------------ Main Function ------------------------------
# Generate quiz for a topic
def generate_quiz_for_topic(supabase: Client, params: QuizGenParams) -> Dict[str, Any]:
    """
    Expand scope, retrieve, (optional rerank), LLM, validate, insert rows.
    Mutates quizzes/quiz_questions/quiz_options and returns a summary dict.
    """
    # require active chunks
    chunks_count = (
        supabase.table("chunks")
        .select("id", count="exact")
        .eq("topic_id", params.topic_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    # if no active chunks, fail
    if (getattr(chunks_count, "count", None) or 0) == 0:
        raise ValueError("No active chunks for this topic")

    # mark quiz as processing
    supabase.table("quizzes").update({"status": "processing"}).eq("id", params.quiz_id).execute()

    # build vector store + LLM
    vs = build_vec_store()
    llm = get_llm()

    # query from scope
    query = (params.scope or "Comprehensive overview").strip()

    # Load config
    cfg = load_config()

    # Determine retriever mode from config
    search_cfg = (cfg.get("vector_store", {}).get("search", {}) or {})

    # Determine retriever mode from config with fallback
    cfg_mode = (search_cfg.get("retriever") or "multiquery").lower()

    # Do not use selfquery
    if cfg_mode == "selfquery":
        cfg_mode = "multiquery"  # fallback

    # allow caller override via params.mode (defaults to multiquery)
    use_multi = (params.mode in ("multiquery", "both")) or (cfg_mode == "multiquery")
    use_hyde = (params.mode in ("hyde", "both"))

    # Retrieve documents
    docs: List[Document] = retrieve_with_expansion(
        vs=vs,
        llm=llm,
        query=query,
        topic_id=params.topic_id,
        fetch_k=params.fetch_k,
        filters={"topic_id": params.topic_id, "is_active": True},
        mode="multiquery",
        expansions=params.expansions,
        use_multiquery=use_multi,
        use_hyde=use_hyde,
        hyde_n=params.hyde_n,
    )

    # optional rerank - set in config
    if params.reranker_provider:
        rr = build_reranker(params.reranker_provider, params.reranker_model, llm=llm)
        docs = apply_rerank(query, docs, reranker=rr, top_k=min(params.top_k_after_rerank, len(docs)))
    else:
        docs = docs[: params.top_k_after_rerank]

    # LLM - questions (strict JSON)
    context = format_summ_context(docs)

    # if no context, fail
    if not context.strip():
        # Update quiz status to failed
        supabase.table("quizzes").update({"status": "failed"}).eq("id", params.quiz_id).execute()
        raise ValueError("Retrieved empty context for quiz generation")

    # Build prompt
    schema = QuizPacket.model_json_schema()
    sys = SYSTEM_BASE
    user = USER_INSTRUCTIONS.format(count=params.count, difficulty=params.difficulty, schema=json.dumps(schema))
    
    # full prompt
    full_prompt = f"{sys}\n\nCONTEXT:\n{context}\n\nUser:\n{user}"

    # Invoke LLM
    raw_output = llm.invoke(full_prompt)
    text = coerce_content_to_text(getattr(raw_output, "content", raw_output)).strip()

    # strip problematic code fences should they appear
    cleaned = text
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`\n ").lstrip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].lstrip()

    # Try parse JSON
    try:
        data = json.loads(cleaned)
    except Exception:
        # retry once with stricter instruction
        raw_output2 = llm.invoke(full_prompt + "\n\nReturn ONLY minified JSON. No markdown.")
        text2 = coerce_content_to_text(getattr(raw_output2, "content", raw_output2)).strip()
        if text2.startswith("```"):
            text2 = text2.strip("`\n ").lstrip()
            if text2.lower().startswith("json"):
                text2 = text2[4:].lstrip()
        try:
            data = json.loads(text2)
        except Exception as e:
            # mark quiz as failed
            supabase.table("quizzes").update({"status": "failed"}).eq("id", params.quiz_id).execute()
            raise RuntimeError(f"Quiz generation JSON parse failed: {e}\nModel output:\n{text}")

    # validate output and normalize (ensure 4 options, single correct option)
    try:
        packet = QuizPacket.model_validate(data)
    except ValidationError:
        # mark quiz as failed
        supabase.table("quizzes").update({"status": "failed"}).eq("id", params.quiz_id).execute()
        raise

    # fix questions to ensure exactly 4 options and single correct
    fixed_questions: List[QuizQuestion] = []

    # force exactly 4 options, labeled A-D, single correct
    labels = ["A", "B", "C", "D"]

    # iterate questions
    for q in packet.questions[: params.count]:
        opts = list(q.options)

        # pad or trim to 4 options
        if len(opts) < 4:
            for i in range(4 - len(opts)):
                opts.append(QuizOption(option_id=f"X{i+1}", text="None of the above", is_correct=False))
        # trim to 4 if too many
        elif len(opts) > 4:
            opts = opts[:4]

        # ensure single correct option
        correct_seen = False
        new_opts: List[QuizOption] = []

        # iterate options
        for i, o in enumerate(opts):
            corr = bool(getattr(o, "is_correct", False)) and not correct_seen

            # only first correct option is kept as correct
            if corr:
                correct_seen = True
            new_opts.append(QuizOption(option_id=labels[i], text=o.text, is_correct=corr))

        # if no correct option, force first to be correct
        if not correct_seen and new_opts:
            new_opts[0] = QuizOption(option_id=new_opts[0].option_id, text=new_opts[0].text, is_correct=True)

        # add fixed question
        fixed_questions.append(QuizQuestion(prompt=q.prompt.strip(), options=new_opts))

    # persist to supabase
    # delete existing questions/options for this quiz first - in case of regenerate
    existing_q = (
        supabase.table("quiz_questions")
        .select("id")
        .eq("quiz_id", params.quiz_id)
        .execute()
    )

    # collect existing question IDs
    existing_q_ids = [row["id"] for row in (existing_q.data or [])]

    # delete existing options and questions
    if existing_q_ids:
        supabase.table("quiz_options").delete().in_("question_id", existing_q_ids).execute()
        supabase.table("quiz_questions").delete().eq("quiz_id", params.quiz_id).execute()

    # insert new questions and options
    for order, q in enumerate(fixed_questions):
        q_ins = (
            supabase.table("quiz_questions")
            .insert(
                {"quiz_id": params.quiz_id, "question": q.prompt, "order_index": order},
                returning="representation",
            )
            .execute()
        )
        # get new question ID
        q_id = q_ins.data[0]["id"]
        option_rows = [
            {"question_id": q_id, "option_text": opt.text, "is_correct": bool(opt.is_correct)}
            for opt in q.options
        ]
        # insert options
        supabase.table("quiz_options").insert(option_rows, returning="minimal").execute()

    # update quiz row
    supabase.table("quizzes").update({"status": "ready"}).eq("id", params.quiz_id).execute()

    # return summary
    return {
        "quiz_id": params.quiz_id,
        "inserted_questions": len(fixed_questions),
        "context_docs": len(docs),
        "mode": params.mode,
        "scope": params.scope,
    }


# --------------------- Generate quiz job wrapper ----------------------- #
def generate_quiz_job(supabase: Client, quiz_id: str) -> Dict[str, Any]:
    """ Wrapper to generate quiz from quiz_id. Fetches quiz row and calls main function. """

    # Fetch quiz row from supabase
    qres = (
        supabase.table("quizzes")
        .select("id, topic_id, user_id, length, difficulty, scope")
        .eq("id", quiz_id)
        .limit(1)
        .execute()
    )

    # Validate quiz row exists
    rows = qres.data or []
    if not rows:
        raise RuntimeError("Quiz not found")
    
    # extract row and build params
    row = rows[0]
    params = QuizGenParams(
        topic_id=row["topic_id"],
        quiz_id=row["id"],
        user_id=row["user_id"],
        scope=row.get("scope"),
        count=int(row.get("length", 10)),
        difficulty=row.get("difficulty", "medium"),
    )

    # Call main function
    return generate_quiz_for_topic(supabase, params)
