# Import necessary modules and libs
from __future__ import annotations
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from pydantic import Field
from supabase import create_client, Client
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.retrievers import BaseRetriever

# import settings
from ..settings import Settings, load_config

# Define RPC configuration dataclass
@dataclass
class RPC_config:
    table: str
    query_name: str
    embedding_dim: int

# Define SupaRPCRetriever class
class SupaRPCRetriever(BaseRetriever):
    """
    Pydantic retriever that calls Supabase RPC (public.match_documents) - see database schema
    and returns LangChain Documents.
    """
    client: Client
    embeddings: Embeddings
    rpc_cfg: RPC_config
    search_kwargs: Dict[str, Any] = Field(default_factory=dict)

    # Method to get relevant documents based off of user query
    def get_relevant_documents(self, query: str, *, run_manager=None) -> List[Document]:
        """Get documents relevant to the query."""

        # Extract search parameters - how many results
        k = int(self.search_kwargs.get("k", 10))

        # Extract filter parameters - topic_id is required, is_active defaults to True
        f: Dict[str, Any] = (self.search_kwargs.get("filter") or {})
        topic_id = f.get("topic_id")
        only_active = f.get("is_active", True)
        doc_id_filter = f.get("document_id")

        # Embed the query using the provided embeddings
        question_emb: List[float] = self.embeddings.embed_query(query)

        # Prepare the payload for the RPC call
        payload = {
            "query_embedding": question_emb,
            "match_count": k,
            "p_topic_id": topic_id,
            "p_only_active": bool(only_active) if only_active is not None else True,
        }

        # Call the Supabase RPC function
        out = self.client.rpc(self.rpc_cfg.query_name, payload).execute()

        # Parse the returned rows
        rows = getattr(out, "data", None)
        if rows is None:
            if isinstance(out, dict) and "data" in out:
                rows = out["data"]
            else:
                rows = out if isinstance(out, list) else []

        # Convert rows to LangChain Documents
        docs: List[Document] = []
        for r in rows or []:
            # Extract content and metadata
            content = r.get("content") or r.get("page_content") or ""
            meta = r.get("metadata") or {}
            # Client-side doc_id filter
            if doc_id_filter and meta.get("document_id") != doc_id_filter:
                continue
            # Append Document to the list
            docs.append(Document(page_content=content, metadata=meta))
        return docs

    # Method to perform similarity search
    def similarity_search(self, query: str, k: int = 10, filter: Optional[Dict[str, Any]] = None) -> List[Document]:
        """Return docs most similar to query."""

        # Create a copy of the retriever with updated search parameters
        retriever_copy = self.model_copy(update={"search_kwargs": {"k": k, "filter": filter or {}}})

        # Get relevant documents using the updated retriever
        return retriever_copy.get_relevant_documents(query)


# Define SupabaseRPCVectorStore class
class SupabaseRPCVectorStore:
    """Supabase RPC Vector Store. Exposes 'as_retriever' and 'similarity_search' methods."""

    # Initialize the vector store
    def __init__(self, client: Client, embeddings: Embeddings, rpc_cfg: RPC_config):
        """Initialize with Supabase client, embeddings, and RPC configuration."""
        self.client = client
        self.embeddings = embeddings
        self.rpc_cfg = rpc_cfg

    # Method to get a retriever instance
    def as_retriever(self, search_kwargs: Optional[Dict[str, Any]] = None) -> BaseRetriever:
        """Return a SupaRPCRetriever instance."""
        return SupaRPCRetriever(
            client=self.client,
            embeddings=self.embeddings,
            rpc_cfg=self.rpc_cfg,
            search_kwargs=search_kwargs or {},
        )

    # Method to perform similarity search
    def similarity_search(self, query: str, k: int = 10, filter: Optional[Dict[str, Any]] = None) -> List[Document]:
        """Return docs most similar to query."""

        ret = self.as_retriever({"k": k, "filter": filter or {}})
        return ret.similarity_search(query, k=k, filter=filter)

# Function to build and return a SupabaseRPCVectorStore instance
def build_supabase_vectorstore(embeddings: Embeddings) -> SupabaseRPCVectorStore:
    """Builds a SupabaseRPCVectorStore from settings and config."""

    # Load settings and configuration
    s = Settings()
    cfg = load_config()
    rpc_cfg = RPC_config(
        table=cfg["vector_store"]["table"],
        query_name=cfg["vector_store"]["query_name"],
        embedding_dim=int(cfg["vector_store"].get("embedding_dim", 1536)),
    )

    # Create Supabase client
    client = create_client(
        s.SUPABASE_URL,
        s.SUPABASE_SERVICE_KEY or s.SUPABASE_ANON_KEY
    )

    # Return the SupabaseRPCVectorStore instance
    return SupabaseRPCVectorStore(client, embeddings, rpc_cfg)
