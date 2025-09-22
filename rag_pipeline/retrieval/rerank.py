# Import necessary modules
from typing import List, Dict, Any

# Import RerankerChassis from providers
from ..providers.rerankers import RerankerChassis

# Function to rerank documents
def rerank(query: str, docs: List[Dict[str, Any]], reranker: RerankerChassis, top_k: int) -> List[Dict[str, Any]]:
    """Rerank documents based on a query using a reranker. Returns top_k documents."""
    return reranker.rerank(query, docs, top_k=top_k)

