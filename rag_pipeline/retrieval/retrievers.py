# Import necessary modules
from __future__ import annotations
from typing import Any, Dict, List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.vectorstores import VectorStore

# Import retriever factory
from ..retrieval.retriever_factory import build_retriever

# -------------------- MULTIQUERY EXPANSION --------------------
# Function for multiquery expansion
def multiquery_expand(llm: BaseChatModel, query: str, n: int = 3) -> List[str]:
    """Use an LLM to generate multiple diverse rewrites of the input query. 
    Takes query and number of rewrites n; returns list of rewrites."""

    # N must be at least 1
    n = max(1, int(n))

    # Create the prompt for the LLM
    prompt = (
        "You are generating search queries for dense retrieval.\n"
        f"Rewrite the user's question into {n} diverse, specific phrasings.\n"
        "Return each rewrite on its own line; no numbering or extra text.\n\n"
        f"User question:\n{query}\n\n"
        "Rewrites:"
    )

    # Invoke the LLM with the prompt
    llm_resp = llm.invoke(prompt)

    # Process the response to extract unique rewrites
    text = getattr(llm_resp, "content", str(llm_resp))

    # Split lines, clean up, and ensure uniqueness
    alts_split = [ln.strip("•- \t") for ln in text.splitlines() if ln.strip()]

    # Keep only unique rewrites, up to n
    seen, outs = set(), []
    for a in alts_split:
        if a not in seen:
            seen.add(a); outs.append(a)
        if len(outs) >= n:
            break

    # Return the unique rewrites
    return outs

# -------------------- HYDE EXPANSION --------------------
# Function for hyde expansion
def hyde_expand(llm: BaseChatModel, query: str, num_hyde: int = 1) -> List[str]:
    """Use an LLM to generate hypothetical answers to the input query.
    Takes query and number of hypothetical answers num_hyde; returns list of answers."""

    # Ensure at least one hypothetical answer
    num_hyde = max(1, int(num_hyde))

    # Create the prompt for the LLM
    prompt = (
        "Write a short, factual note that could answer the user's question. "
        "Keep under 150 words. Use a neutral, textbook tone.\n\n"
        f"User Question: {query}\n\nHypothetical answer:"
    )

    # Generate the hypothetical answers
    outs: List[str] = []
    for _ in range(num_hyde):
        resp = llm.invoke(prompt)
        outs.append(getattr(resp, "content", str(resp)).strip())

    # Return the hypothetical answer/s
    return outs


# Helper function to execute the retrieval step
def execute_retrieval(ret, q: str):
    """ Attempt to use the retriever's invoke method if available"""
    try:
        # If the retriever has an invoke method, use it
        return ret.invoke(q)
    except Exception:
        # Otherwise, fall back to get_relevant_documents
        return ret.get_relevant_documents(q)


# -------------------- MAIN RETRIEVAL WITH EXPANSION --------------------
# Main function to retrieve with expansion

def retrieve_with_expansion(
    vs: VectorStore,
    llm: BaseChatModel,
    query: str,
    topic_id: Optional[str],
    fetch_k: int,
    filters: Optional[Dict[str, Any]] = None,
    mode: str = "multiquery",
    expansions: int = 3,
    use_multiquery: bool = True,
    use_hyde: bool = False,
    hyde_n: int = 1,
) -> List[Dict[str, Any]]:
    """Retrieve documents from the vector store with optional query expansion.
    Uses multiquery expansion and/or hyde expansion based on parameters.
    Returns a list of dicts with content, metadata, and similarity score."""

    # Prepare the vector search parameters
    search_kwargs = {"k": fetch_k}
    if filters:
        search_kwargs["filter"] = filters

    # Build the retriever based on the specified mode
    retriever = build_retriever(
        mode=("multiquery" if use_multiquery else mode),
        base_vs=vs,
        llm=llm,
        k=fetch_k,
        search_kwargs=search_kwargs,
    )

    # Generate the list of queries to use
    queries: List[str] = [query]
    if use_multiquery:
        queries.extend(multiquery_expand(llm, query, n=expansions))

    # Retrieve documents for each query
    docs = []
    for q in queries:
        docs.extend(execute_retrieval(retriever, q))

    # If using hyde expansion, generate hypothetical answers and retrieve for them
    if use_hyde:
        for hx in hyde_expand(llm, query, num_hyde=hyde_n):
            docs.extend(execute_retrieval(retriever, hx))

    # Remove duplicates while preserving order
    seen = set()
    results: List[Dict[str, Any]] = []
    for d in docs:
        meta = dict(d.metadata or {})
        key = (d.page_content, meta.get("document_id"), meta.get("page"))
        if key in seen:
            continue
        # Mark as seen and add to results
        seen.add(key)
        results.append({
            "content": d.page_content,
            "metadata": meta,
            "similarity": meta.get("similarity"),
        })
        
    # Return the final results
    return results
