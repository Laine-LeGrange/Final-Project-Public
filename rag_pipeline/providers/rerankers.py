# Import necessary modules
from __future__ import annotations
from typing import List, Dict, Any, Optional
import os

# Import reranker libraries
import cohere
from langchain_community.document_compressors import FlashrankRerank
from langchain_core.documents import Document
from sentence_transformers import CrossEncoder

# -------------  base reranker class ------------- #
class RerankerChassis:
    def rerank(self, query: str, docs: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        """ RerankerChassis used as a base class for all rerankers. """
        raise NotImplementedError


# -------------  NoneReranker class ------------- #
class NoneReranker(RerankerChassis):
    def rerank(self, query, docs, top_k):
        """ None reranker that returns the top_k documents as-is. 
         No reranking is performed. """
        if not docs:
            return []
        return docs[:top_k]


# ------------- CohereReranker class ------------- #
class CohereReranker(RerankerChassis):

    def __init__(self, model: str):
        """ Initialize the CohereReranker with the specified model. """

        # Get the Cohere API key from env
        api_key = os.environ.get("COHERE_API_KEY", "")
        if not api_key:
            raise ValueError("COHERE_API_KEY is not set for CohereReranker.")

        # Initialize the Cohere client
        self.client = cohere.Client(api_key)

        # set the model
        self.model = model

    # Method to rerank documents
    def rerank(self, query, docs, top_k):
        """ Rerank documents based on the query using the Cohere reranker model. """
        if not docs:
            return []

        res = self.client.rerank(
            model=self.model,
            query=query,
            documents=[d["content"] for d in docs],
            top_n=top_k,
        )
        # Return the top_k documents with their rerank scores
        return [docs[r.index] | {"rerank_score": float(r.relevance_score)} for r in res.results]


# ------------- FlashRankReranker class ------------- #
class FlashRankReranker(RerankerChassis):

    def __init__(self, model: Optional[str] = None, top_n: int = 5, score_threshold: float = 0.0):
        """ Initialize the FlashRankReranker with the specified model. """
        self.compressor = FlashrankRerank(
            model=model, 
            top_n=top_n,
            score_threshold=score_threshold,
        )

    # Method to rerank documents
    def rerank(self, query: str, docs: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        """ Rerank documents based on the query using the FlashRank model. """
        if not docs:
            return []

        # Convert input docs to LangChain Documents
        lc_docs = [Document(page_content=d["content"], metadata=d.get("metadata", {})) for d in docs]
        ranked_docs = self.compressor.compress_documents(lc_docs, query)[:top_k]

        # Extract reranked texts and scores
        ranked_texts = {d.page_content for d in ranked_docs}
        scores = {d.page_content: d.metadata.get("relevance_score") for d in ranked_docs}

        # Build output list
        out: List[Dict[str, Any]] = []
        for d in docs:
            if d["content"] in ranked_texts and len(out) < top_k:
                s = scores.get(d["content"])
                out.append(d if s is None else (d | {"rerank_score": float(s)}))
        return out

# -------------  BGEReranker class ------------- #
class BGEReranker(RerankerChassis):
    def __init__(self, model_name: str = "BAAI/bge-reranker-large"):
        """ Initialize the BGEReranker with the specified model. """
        self.model = CrossEncoder(model_name)

    # Method to rerank documents
    def rerank(self, query, docs, top_k):
        """ Rerank documents based on the query using the BGE reranker model. """
        if not docs:
            return []

        # Create pairs of (query, document content)
        pairs = [[query, d["content"]] for d in docs]

        # Get relevance scores from the model
        scores = self.model.predict(pairs).tolist()

        # Combine docs with their scores and sort by relevance score
        ranked = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)[:top_k]

        # Return the top_k documents with their rerank scores
        return [d | {"rerank_score": float(s)} for d, s in ranked]


# ------------------ Main function to build reranker ------------------ #

# Function to build a reranker
def build_reranker(provider: Optional[str], model: Optional[str], llm=None) -> RerankerChassis:
    """ Build and return a reranker instance based on the provider and model. """

    # Normalize provider string
    prov = (provider or "").lower()

    # Return the appropriate reranker instance
    if prov in {"", "disabled", "none"}:
        return NoneReranker()
    if prov == "cohere":
        return CohereReranker(model or "rerank-english-v3.0")  # or "rerank-multilingual-v3.0" for future multilingual support
    if prov == "flashrank":
        return FlashRankReranker(model=model)
    if prov == "bge":
        return BGEReranker(model or "BAAI/bge-reranker-large")
    
    # Fallback to NoneReranker if provider is unknown/missing
    return NoneReranker()
