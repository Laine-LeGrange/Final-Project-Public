
# Import necessary modules and libs, with langchain components
from typing import Literal, Optional, Dict, Any
from langchain.chains.query_constructor.base import AttributeInfo
from langchain.retrievers import SelfQueryRetriever
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.vectorstores import VectorStore

# Import attributes and description from schema
from .schema import ATTRIBUTES, DOCUMENT_CONTENT_DESCRIPTION

# Function to build retriever based on mode
def build_retriever(
    mode: Literal["vanilla","multiquery","compress"],
    base_vs: VectorStore,
    llm: BaseChatModel,
    k: int,
    metadata_attrs: list[AttributeInfo] = ATTRIBUTES,
    search_kwargs: Optional[Dict[str, Any]] = None,
):
    """Builds a retriever from a vector store, in different modes."""
    # Set search kwargs with k and any additional parameters
    skw = {"k": k, **(search_kwargs or {})}

    # Check that mode passed is valid
    if mode in ("vanilla", "multiquery", "compress"):
        return base_vs.as_retriever(search_kwargs=skw)

    # Invalid mode passed for retriever
    raise ValueError(f"Unknown retriever mode: {mode}")
