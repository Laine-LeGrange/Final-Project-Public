# Import necessary modules
from __future__ import annotations
from typing import List

# Import Supabase client
from supabase import Client

# Import modules from the project
from ..settings import load_config
from ..providers.embeddings import build_embeddings
from .loaders import load_texts_from_bytes
from .chunking import chunk_texts

# Define batch size for database inserts
BATCH_SIZE = 100

# Helper function to yield batches
def batches(iterable, n):
    """Yield successive n-sized chunks from iterable."""
    buf = []

    # Iterate over the input iterable
    for x in iterable:
        buf.append(x)
        if len(buf) == n:
            yield buf
            buf = []
    if buf:
        yield buf


# ----------------------- INGESTION PIPELINE -----------------------

def ingest_file_path(
    supabase_client: Client,
    topic_id: str,
    user_id: str,
    storage_path: str,
    file_name: str,
    media_type: str | None,
    bucket: str = "topic-files",
):
    """ Ingest a file from Supabase Storage, chunk it, embed it, and store in the vector DB."""

    # Download the file from Supabase Storage
    # using bytes for standardization across different file types for downstream handling
    file_bytes: bytes = supabase_client.storage.from_(bucket).download(storage_path)

    # Fetch topic file and get id
    tf_res = (
        supabase_client
        .table("topic_files")
        .select("id")
        .eq("topic_id", topic_id)
        .eq("storage_path", storage_path)
        .limit(1)
        .execute()
    )

    tf_rows = tf_res.data or []
    # Topic file must exist
    if not tf_rows:
        raise ValueError("topic_file row not found; insert it before ingestion")
    
    # Get the topic_file_id
    topic_file_id = tf_rows[0]["id"]

    # Insert a new document record
    doc_res = supabase_client.table("documents").insert(
        {
            "topic_id": topic_id,
            "topic_file_id": topic_file_id,
            "title": file_name,
            "metadata": {"storage_path": storage_path},
        },
        returning="representation",
    ).execute()

    # Handle insertion of document error
    if not doc_res.data:
        raise RuntimeError("Failed to insert document")
    document_id = doc_res.data[0]["id"]

    # Load texts from the file bytes
    texts, detected_media = load_texts_from_bytes(file_name, file_bytes)

    # Load config for chunking and embeddings
    cfg = load_config()
    c_cfg = (cfg.get("chunking") or {})
    chunk_size = int(c_cfg.get("size", 1200))
    chunk_overlap = int(c_cfg.get("overlap", 200))

    # Chunk the texts
    chunks: List[str] = chunk_texts(texts, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    # Fallback to original text
    if not chunks:
        chunks = texts

    # Get embeddings config
    e_cfg = cfg.get("embeddings") or {}

    # Build the embeddings model
    emb = build_embeddings(
        provider=e_cfg.get("provider"),
        model=e_cfg.get("model"),
        force_dim=e_cfg.get("force_dim", 1536),
    )

    # Embed the chunks
    vectors: List[List[float]] = emb.embed_documents(chunks)

    # Prepare rows for insertion into chunks table
    rows = []
    for content, vec in zip(chunks, vectors):
        rows.append({
            "document_id": document_id,
            "topic_id": topic_id,
            "content": content,
            "embedding": vec,
            "token_count": max(1, len(content.split())),
            "is_active": True,
            "metadata": {
                "file_name": file_name,
                "storage_path": storage_path,
                "user_id": user_id,
                "media_type": detected_media,
            },
        })

    # Insert chunks in batches
    for batch in batches(rows, BATCH_SIZE):
        supabase_client.table("chunks").insert(batch, returning="minimal").execute()

    # update topic_file vector_status to 'ingested'
    supabase_client.table("topic_files").update(
        {"vector_status": "ingested"}
    ).eq("id", topic_file_id).execute()

    # Return metadata about the ingestion
    return {"document_id": document_id, "chunks": len(rows), "media_type": detected_media}
