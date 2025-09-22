# Import necessary libraries and modules
# Import safely in case some providers are not installed yet
from langchain_core.embeddings import Embeddings
from langchain_openai import OpenAIEmbeddings
try:
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
except Exception:
    GoogleGenerativeAIEmbeddings = None
try:
    from langchain_cohere import CohereEmbeddings
except Exception:
    CohereEmbeddings = None

# Function to build embeddings based on provider and model
def build_embeddings(provider: str, model: str, force_dim: int = 1536) -> Embeddings:
    """Builds and returns an embeddings model based on provider and model name passed
    from the config YAML file."""

    # Normalize provider string
    p = (provider or "").lower()

    # OpenAI embeddings
    if p == "openai":
        return OpenAIEmbeddings(model=model)
    
    # Google Gemini AI embeddings
    if p in ("gemini","google") and GoogleGenerativeAIEmbeddings:
        return GoogleGenerativeAIEmbeddings(model=model, dimensions=force_dim)
    
    # Cohere embeddings
    if p == "cohere" and CohereEmbeddings:
        return CohereEmbeddings(model=model, embedding_dimensions=force_dim)
    
    # fallback to OpenAI embeddings model
    return OpenAIEmbeddings(model="text-embedding-3-small")
