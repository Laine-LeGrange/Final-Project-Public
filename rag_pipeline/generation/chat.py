# Import standard libraries
from __future__ import annotations
from typing import Any, Dict, List, TypedDict, Annotated, Optional
import operator
from pathlib import Path

# Import langgraph and langchain libraries
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.messages import AnyMessage, HumanMessage, AIMessage

# Import local modules
from ..providers.llms import build_llm, invoke_text
from ..providers.embeddings import build_embeddings
from ..providers.rerankers import build_reranker
from ..vector_store.supabase_vs import build_supabase_vectorstore
from ..retrieval.retrievers import retrieve_with_expansion
from ..retrieval.rerank import rerank
from ..settings import load_config, Settings

# Setup logging
import logging, os
logging.basicConfig(level=os.getenv("RAG_LOG_LEVEL", "INFO"))
log = logging.getLogger("rag.prompt")


# Define ChatState TypedDict
class ChatState(TypedDict, total=False):
    """ State for chat graph. """
    messages: Annotated[List[AnyMessage], operator.add]
    topic_id: str
    prefs: Dict[str, Any]
    contexts: List[Dict[str, Any]]
    debug: Dict[str, str]

# ------------------------ PROMPT BUILDING HELPERS -----------------------

# Build user preferences block
def build_preferences_block(prefs: Dict[str, Any]) -> str:
    """ Build user preferences block for the prompt. """
    return "\n".join([
        f"- Education level: {prefs.get('education_level','unspecified')}",
        f"- Learning style: {prefs.get('learning_style','unspecified')}",
        f"- Explanation format: {prefs.get('explanation_format','unspecified')}",
        f"- Study goals: {', '.join(prefs.get('study_goals', [])) or 'unspecified'}",
        f"- Tone: {prefs.get('tone','neutral')}",
    ])

# Format chat history into a string
def format_chat_hist(messages: List[AnyMessage], max_turns: int = 4) -> str:
    """ Format chat history into a string. """
    if not messages: return ""
    hist = messages[:-1][-max_turns:] 
    lines: List[str] = []
    for m in hist:
        role = "User" if m.type == "human" else "Assistant" if m.type == "ai" else m.type
        content = (getattr(m, "content", "") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)

# Format retrieved contexts into a string
def format_retrieved_contexts(ctxs: List[Dict[str, Any]], top_k: int) -> str:
    """ Format retrieved contexts into a string for the prompt. """
    parts = []
    for i, d in enumerate(ctxs[:top_k]):
        meta = d.get("metadata", {}) or {}
        fn = meta.get("file_name", "?")
        parts.append(f"[{i+1}] (doc={fn})\n{d.get('content','')}")
    return "\n\n".join(parts)

# Load prompt template for generation stage
def load_prompt_template() -> str:
    """ Load prompt template from file or return default. """

    # Get prompt file paths
    template_path = [
        Path(__file__).resolve().parents[1] / "prompts" / "chat_prompt_v3.txt",
        Path(__file__).resolve().parents[1] / "prompts" / "chat_prompt_v2.txt",
        Path(__file__).resolve().parents[1] / "prompts" / "chat_prompt_v1.txt",
    ]
    for p in template_path:
        if p.exists():
            return p.read_text(encoding="utf-8")
        
    # Fallback default template
    return (
        "You are a helpful study assistant.\n\n"
        "USER PREFERENCES:\n{{PREFS_BLOCK}}\n\n"
        "CONVERSATION SO FAR:\n{{HISTORY}}\n\n"
        "QUESTION:\n{{QUESTION}}\n\n"
        "CONTEXT SNIPPETS:\n{{CONTEXT_BLOCK}}\n\n"
        "INSTRUCTIONS:\n"
        "- Use conversation history for continuity.\n"
        "- Use retrieved context and cite filenames when helpful.\n"
        "- Be concise but complete.\n"
        "- If context is insufficient, say what's missing.\n"
    )

# Final prompt 
def build_final_prompt(t: str, *, prefs_block: str, history: str, question: str, context_block: str) -> str:
    """ Build the final prompt by replacing placeholders in the template. """
    return (
        t.replace("{{PREFS_BLOCK}}", prefs_block)
         .replace("{{HISTORY}}", history)
         .replace("{{QUESTION}}", question)
         .replace("{{CONTEXT_BLOCK}}", context_block)
    )

# ------------------------ RAG GRAPH NODES ------------------------

# Retrieval node
def retrieval_node(state: ChatState) -> ChatState:
    """ Retrieval node to get relevant contexts for the latest user question. """

    # Load config
    cfg = load_config()
    s = Settings()

    # Build LLM, embeddings, and vector store
    llm = build_llm(**cfg["llm"])
    emb = build_embeddings(**cfg["embeddings"])
    vs = build_supabase_vectorstore(emb)

    # If no messages or last message not from user, clear contexts and return
    if not state.get("messages") or state["messages"][-1].type != "human":
        state["contexts"] = []
        return state
    question = state["messages"][-1].content

    # Determine retriever settings from config
    search_cfg = (cfg.get("vector_store", {}).get("search", {})) or {}
    retriever_mode = search_cfg.get("retriever", "multiquery")
    use_multi = retriever_mode == "multiquery"
    fetch_k = int(search_cfg.get("fetch_k", 120))
    top_k = int(search_cfg.get("top_k", 30))

    # Retrieve relevant contexts
    retrieved_contexts = retrieve_with_expansion(
        vs=vs,
        llm=llm,
        query=question,
        topic_id=state["topic_id"],
        fetch_k=fetch_k,
        filters={"topic_id": state["topic_id"], "is_active": True},
        mode=retriever_mode,
        expansions=3,
        use_multiquery=use_multi,
        use_hyde=False,
        hyde_n=1,
    )

    # Rerank if reranker configured
    rr_cfg = cfg.get("reranker", {}) or {}
    provider = rr_cfg.get("provider", "disabled")

    # Rerank if provider specified and not 'disabled'
    if provider and provider != "disabled":
        rr = build_reranker(provider, rr_cfg.get("model",""), llm=llm)
        ranked = rerank(question, retrieved_contexts, rr, rr_cfg.get("top_k", top_k))
    else:
        ranked = retrieved_contexts[: top_k]

    # Update state with top_k contexts
    state["contexts"] = ranked[: top_k]
    return state

# Generation node
def generate_node(state: ChatState) -> ChatState:

    """ Generation node to produce an answer using the chat LLM. """

    # Load config
    cfg = load_config()

    # Build LLM
    llm = build_llm(**cfg["llm"])

    # If no messages or last message not from user, return state unchanged
    if not state.get("messages") or state["messages"][-1].type != "human":
        return state
    
    # if retrieval produced no contexts, return a default message
    if not state.get("contexts"):
        return {**state, "messages": [AIMessage(content="No matching documents in your knowledge base were found for your query. Try rephrasing, broadening your search or check that you have uploaded the relevants.")]}

    # Build prompt components
    question = state["messages"][-1].content
    prefs_block = build_preferences_block(state.get("prefs", {}))
    history_block = format_chat_hist(state["messages"], max_turns=6)

    # Format retrieved contexts
    top_k = int((cfg.get("vector_store", {}).get("search", {}) or {}).get("top_k", 30))
    context_block = format_retrieved_contexts(state.get("contexts", []), top_k)

    # Load prompt template and build final prompt
    tmpl = load_prompt_template()
    prompt = build_final_prompt(
        tmpl,
        prefs_block=prefs_block,
        history=history_block,
        question=question,
        context_block=context_block,
    )

    # Invoke LLM with prompt
    answer = invoke_text(llm, prompt)

    # Append AI message to state messages
    return {**state, "messages": [AIMessage(content=answer)]}


# ------------------------ CHAT GRAPH SETUP ------------------------ 

# Setup in-memory checkpointer
_CHECKPOINTER = InMemorySaver()

# Compile the CHAT graph
def compile_chat_graph():
    """ Compile and return the Chat graph. """

    # Define the graph structure
    g = StateGraph(ChatState)
    g.add_node("retrieve", retrieval_node)
    g.add_node("generate", generate_node)
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "generate")
    g.add_edge("generate", END)
    return g.compile(checkpointer=_CHECKPOINTER)

# Compile the graph once
_GRAPH = compile_chat_graph()

# ------------------------ MAIN CHAT FUNCTION ------------------------ 

# Answer question function
def answer_question(
    session_id: str,
    topic_id: str,
    query: str,
    prefs: Dict[str, Any] | None = None,
    document_id: str | None = None,
    debug: bool = False,
) -> Dict[str, Any]:
    
    """ Answer a user question using the RAG chat graph. """
    # Prepare initial chat state
    inputs: ChatState = {
        "messages": [HumanMessage(content=query)],
        "topic_id": topic_id,
        "prefs": prefs or {},
        "contexts": [],
    }

    # Invoke the RAG graph
    graph_output = _GRAPH.invoke(inputs, config={"configurable": {"thread_id": session_id}})

    # Extract the final answer and context metadata
    answer = ""
    for m in reversed(graph_output.get("messages", [])):
        if m.type == "ai":
            answer = getattr(m, "content", "") or ""
            break

    # Prepare contexts with file names and document IDs
    contexts = [
        {
            "file_name": (d.get("metadata") or {}).get("file_name"),
            "document_id": (d.get("metadata") or {}).get("document_id"),
        }
        for d in graph_output.get("contexts", [])
    ]

    # Format payload to return
    payload = {"answer": answer, "contexts": contexts}
    return payload
