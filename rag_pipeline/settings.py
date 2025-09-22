# Import necessary modules and libs
from __future__ import annotations
from pathlib import Path
import os
import yaml
from typing import Any, Dict
from pydantic_settings import BaseSettings, SettingsConfigDict

# Define repository root and backend directory paths
REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"

# Define Settings class for configuration
class Settings(BaseSettings):
    # Supabase details
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str | None = None
    SUPABASE_SERVICE_KEY: str | None = None

    # API keys (providers)
    OPENAI_API_KEY: str | None = None
    COHERE_API_KEY: str | None = None
    GOOGLE_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None

    # LangSmith / tracing
    LANGSMITH_TRACING: bool | str | None = None
    LANGSMITH_ENDPOINT: str | None = None
    LANGSMITH_API_KEY: str | None = None
    LANGSMITH_PROJECT: str | None = None

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

# Function to load configuration from the YAML file
def load_config(path: str | None = None) -> Dict[str, Any]:
    """Load the rag pipeline YAML config. If missing, return safe defaults."""
    
    # Determine the config file path
    if path is None:
        path = str(REPO_ROOT / "rag_pipeline" / "config.yaml")

    # If the config file doesn't exist, return default settings
    if not os.path.exists(path):
        return {
            "vector_store": {
                "table": "chunks",
                "query_name": "match_documents",
                "embedding_dim": 1536, # must always be 1536
                "search": {"top_k": 10, "fetch_k": 20},
            },
            "embeddings": {
                "provider": "openai",
                "model": "text-embedding-3-small",
                "force_dim": 1536, # must always be 1536
            },
            "llm": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "max_output_tokens": 800,
            },
        }

    # Read and parse the YAML config file
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()

    # Expand environment vars and load YAML content
    expanded = os.path.expandvars(raw)

    # Return the loaded configs as a dictionary
    return yaml.safe_load(expanded) or {}
