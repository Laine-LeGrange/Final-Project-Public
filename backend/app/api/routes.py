# import libraries
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field 
from typing import Optional, Literal, Any
from langchain_core.documents import Document
import traceback
import logging

# supabase client
from supabase import create_client

# local imports
from app.deps.auth import current_user
from rag_pipeline.settings import Settings, load_config
from rag_pipeline.ingestion.pipeline import ingest_file_path
from rag_pipeline.generation.chat import answer_question
from rag_pipeline.generation.summaries import generate_summaries
from rag_pipeline.generation.quizzes import QuizGenParams, generate_quiz_for_topic

# set up logging
log = logging.getLogger("rag.quizzes")

# set up router for RAG endpoints
rag_router = APIRouter()

# set up supabase client
supa_settings = Settings()
supa_db = create_client(
    supa_settings.SUPABASE_URL,
    supa_settings.SUPABASE_SERVICE_KEY or supa_settings.SUPABASE_ANON_KEY
)

# ---------------- RAG ENDPOINTS ----------------

# ------ INGESTION ------
class IngestReq(BaseModel):
    topic_file_id: str # UUID of the topic_file row to ingest

# Ingests the file at topic_files.storage_path into the RAG system
@rag_router.post("/rag/ingest")
def rag_ingest(req: IngestReq, user = Depends(current_user)):
    """Ingests a file which has been successfully uploaded to Supabase Storage and exists in topic_files table. """
    try:
        # validate topic_file exists
        tf = supa_db.table("topic_files").select("*").eq("id", req.topic_file_id).single().execute().data
        if not tf:
            raise HTTPException(404, "topic_file not found")

        # Ingest the file
        ingestion_stats = ingest_file_path(
            supabase_client=supa_db,
            topic_id=tf["topic_id"],
            user_id=user["id"],
            storage_path=tf["storage_path"],
            file_name=tf["file_name"],
            media_type=tf.get("media_type"),
        )
        # Return ingestion_stats - this is the status of the ingestion operation
        return {"ok": True, "ingestion_stats": ingestion_stats}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --------- CHAT / Q&A ---------

# Model for a chat request
class ChatReq(BaseModel):
    topic_id: str
    session_id: str
    question: str
    prefs: dict[str, Any] = {}
    document_id: Optional[str] = None

# Endpoint for chat
@rag_router.post("/rag/chat")
def rag_chat(req: ChatReq):
    """Answers a user request or question using the RAG pipeline."""
    try:
        _ = load_config()

        # Call the RAG pipeline and get the response 
        out = answer_question(
            session_id=req.session_id,
            topic_id=req.topic_id,
            query=req.question,
            prefs=req.prefs or {},
            document_id=req.document_id,
        )
        # Return the answer and contexts for the frontend to display
        return {
            "answer": out.get("answer", "(no answer)"),
            "contexts": out.get("contexts", []),
        }

    # catch the exception and raise it
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"rag_chat failed: {e}")


# --------- SUMMARY GENERATION ---------

# Model for a summary generation request
class SummariesReq(BaseModel):
    topic_id: str
    mode: Optional[Literal["short","long","key_concepts"]] = None
    prefs: dict[str, Any] = {}

# Endpoint for summary generation
@rag_router.post("/rag/summaries/generate")
def rag_summaries(req: SummariesReq, user = Depends(current_user)):
    """Generates summaries for a given topic_id, stores them in topic_summaries table, and returns them."""
    try:
        # Fetch all active chunks for the topic
        rows_resp = supa_db.table("chunks").select("content,metadata")\
            .eq("topic_id", req.topic_id).eq("is_active", True).limit(2000).execute()
        
        # Get rows from response
        rows = (rows_resp.data or []) if rows_resp else []

        # If no active chunks, raise 400 error
        if len(rows) == 0:
            raise HTTPException(status_code=400, detail="No active chunks for this topic")
        
        # Convert rows to Document objects
        docs = [Document(page_content=r["content"], metadata=r.get("metadata") or {}) for r in rows]

        # Get the user id
        uid = (user or {}).get("id")

        # Setup preferences dict
        db_prefs: dict[str, Any] = {}

        # Fetch user preferences from the DB if user is logged in
        if uid:
            try:
                pref_resp = supa_db.table("user_preferences").select("*").eq("user_id", uid).limit(1).execute()
                if pref_resp and pref_resp.data and len(pref_resp.data) > 0:
                    db_prefs = pref_resp.data[0] or {}

            # If any error occurs, just use an empty dict
            except Exception:
                db_prefs = {}

        # Merge the preferences, prefer the request prefs over DB prefs
        merged_prefs = {**db_prefs, **(req.prefs or {})}

        # Fetch the topic name to help make better summaries
        t_resp = supa_db.table("topics").select("name").eq("id", req.topic_id).limit(1).execute()
        topic_name = (t_resp.data[0]["name"] if (t_resp and t_resp.data) else "Topic")

        # Generate the summaries using the RAG pipeline
        all_sum = generate_summaries(topic_name, docs, merged_prefs)
        payload = all_sum if req.mode is None else {req.mode: all_sum[req.mode]}

        # Upsert the summaries into the topic_summaries table
        for t, content in payload.items():
            supa_db.table("topic_summaries").upsert({
                "topic_id": req.topic_id,
                "type": t,
                "status": "ready",
                "content": content
            }, on_conflict="topic_id,type").execute()

        # Return the generated summaries
        return {"ok": True, "summaries": payload}

    # Handle exceptions
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ------------- QUIZ GENERATION -------------

# Model for quiz generation request
class QuizGenerateReq(BaseModel):
    scope: Optional[str] = None
    count: int = Field(10, ge=1, le=50)
    difficulty: Literal["easy","medium","hard"] = "medium" # default to medium

def delete_exist_quiz_content(quiz_id: str):
    """
    Calls the supabase db helper that deletes attempt_answers -> quiz_attempts -> quiz_options -> quiz_questions
    for the given quiz, in the correct order.
    """
    # Call RPC to delete existing quiz content
    resp = supa_db.rpc("delete_quiz_content", {"p_quiz_id": quiz_id}).execute()

    # Check for errors in the response when attempting to delete existing quiz content
    if getattr(resp, "error", None):
        raise RuntimeError(f"delete_quiz_content RPC failed: {resp.error}")
    if isinstance(getattr(resp, "data", None), dict) and resp.data.get("error"):
        raise RuntimeError(f"delete_quiz_content RPC failed: {resp.data['error']}")

# Endpoint to regenerate a quiz
@rag_router.post("/rag/quizzes/{quiz_id}/generate")
def rag_quizzes_generate(quiz_id: str, req: QuizGenerateReq):
    """
    Generates/Regenerates a quiz:
      1) Validate quiz and topic has active chunks
      2) Mark quiz.status = 'processing'
      3) Delete existing dependent rows via RPC delete_quiz_content
      4) Generate fresh questions/options
      5) Mark quiz.status = 'ready', set generated_at value
    """
    try:
        # Validate the quiz exists
        q = supa_db.table("quizzes").select(
            "id,user_id,topic_id,length,difficulty,scope,status"
        ).eq("id", quiz_id).single().execute().data

        # Raise 404 if quiz not found
        if not q:
            raise HTTPException(status_code=404, detail="Quiz not found")

        # Validate the topic has active chunks
        chunks_count = (
            supa_db.table("chunks")
            .select("id", count="exact")
            .eq("topic_id", q["topic_id"])
            .eq("is_active", True)
            .limit(1)
            .execute()
        )

        # Raise 400 if no active chunks found
        if (chunks_count.count or 0) == 0:
            raise HTTPException(status_code=400, detail="No active chunks for this topic")

        # Determine new parameters for quiz generation --------------------
        # Get the inputted or existing difficulty
        new_difficulty = (req.difficulty or q.get("difficulty") or "medium")
        if new_difficulty not in ("easy", "medium", "hard"):
            raise HTTPException(status_code=400, detail="Invalid difficulty") # raise error if invalid

        # Get the inputted or existing count/length - default to 10 if neither exists
        new_count = (req.count or q.get("length") or 10)
        if not (1 <= new_count <= 50):
            raise HTTPException(status_code=400, detail="Invalid count") # raise error if out of bounds

        # Get the inputted or existing scope - can be None
        new_scope = req.scope if req.scope is not None else q.get("scope")

        # Mark the quiz as processing
        supa_db.table("quizzes").update({"status": "processing"}).eq("id", quiz_id).execute()

        # Delete existing dependent rows - this is when we delete existing questions/options/attempts
        # when a regeneration is requested
        delete_exist_quiz_content(quiz_id)

        # Set up parameters for quiz generation
        params = QuizGenParams(
            topic_id=q["topic_id"],
            quiz_id=quiz_id,
            user_id=q["user_id"],
            scope=new_scope,
            count=new_count,
            difficulty=new_difficulty,
        )

        # Generate the quiz using the RAG pipeline
        quiz_out = generate_quiz_for_topic(supa_db, params)

        # Update the quiz row with new parameters and mark as ready
        supa_db.table("quizzes").update({
            "status": "ready",
            "generated_at": "now()",
            
            "length": new_count,
            "difficulty": new_difficulty,
            "scope": new_scope,
        }).eq("id", quiz_id).execute()

        # Return the quiz generation result
        return {
            "ok": True,
            "quiz_id": quiz_id,
            "inserted_questions": quiz_out.get("inserted_questions", 0)
        }

    # Handle exceptions
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        # Log the error with traceback
        log.error("quiz_generate failed for %s: %s\n%s", quiz_id, e, tb)
        try:
            # Try to mark the quiz as failed
            supa_db.table("quizzes").update({"status": "failed"}).eq("id", quiz_id).execute()
        except Exception:
            pass
        # Raise 500 error with origin exception info
        raise HTTPException(status_code=500, detail=f"quiz_generate failed: {e.__class__.__name__}: {e}")