# Import modules and libraries
from __future__ import annotations
from typing import Optional, Any
from rag_pipeline.settings import Settings
from rag_pipeline.settings import load_config

# Function to build a LangChain chat model for a given provider
def build_llm(
    provider: str = "openai",
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    max_output_tokens: Optional[int] = 800,
    timeout: Optional[float] = None,
):
    """
    Return a LangChain chat model for the given provider.
    Configures each provider to favor plain text output.
    """

    # Normalize provider string
    p = (provider or "openai").lower()

    # Build the appropriate chat model based on the provider

    # OpenAI chat model
    if p == "openai":
        return build_openai_model(model, temperature, max_output_tokens, timeout)

    # Anthropic chat model
    if p == "anthropic":
        return build_anthropic_model(model, temperature, max_output_tokens, timeout)

    # Google Gemini AI chat model
    if p in ("google", "gemini"):
        return build_gemini_model(model, temperature, max_output_tokens, timeout)

    # Cohere chat model
    if p == "cohere":
        return build_cohere_model(model, temperature, max_output_tokens, timeout)

    # Fallback to OpenAI
    return build_openai_model("gpt-4o-mini", temperature, max_output_tokens, timeout)


# Method to invoke the LLM and return text output
def invoke_text(llm, prompt: str) -> str:
    """ Invoke the LLM and return text only output. 
    If the response is not text, retry once with a stricter prompt. """
    
    # Invoke the LLM with the prompt
    res = llm.invoke(prompt)

    # Try to extract text content from the response
    # This is safe against various response formats across providers
    text = coerce_content_to_text(getattr(res, "content", res))
    if text:
        return text

    # If no text, retry once with a stricter prompt
    retry_prompt = prompt + "\n\nReturn your final answer as plain TEXT only."
    try:
        res2 = llm.invoke(retry_prompt)
        text = coerce_content_to_text(getattr(res2, "content", res2))

        # fallback to an empty string if still no text
    except Exception:
        text = ""

    # If still no text, return a default message in the chat
    return text or "I was unable to generate a response for that request."


# Helper function to coearce responses to text
def coerce_content_to_text(content: Any) -> str:

    """ Coerce various response content types to plain text. 
    This protects against different response formats across providers."""

    # Handle None content
    if content is None:
        return ""

    # Handle string or list content
    if isinstance(content, str):
        return content.strip()

    # Handle list response content by extracting text from each part
    if isinstance(content, list):
        lines: list[str] = []

        # Iterate through each part of the list
        for part in content:
            if isinstance(part, dict):
                if isinstance(part.get("text"), str) and part["text"].strip():
                    lines.append(part["text"].strip())
                    continue
                if isinstance(part.get("content"), str) and part["content"].strip():
                    lines.append(part["content"].strip())
                    continue

                # Check for common text-containing keys
                if part.get("type") in {"text", "output_text"} and isinstance(part.get("text"), str):
                    t = part["text"].strip()
                    if t:
                        lines.append(t)
                        continue
                collected = " ".join(
                    v.strip() for v in part.values() if isinstance(v, str) and v.strip()
                )
                if collected:
                    lines.append(collected)
                continue

            # Check for text or content attributes
            t = getattr(part, "text", None)
            if isinstance(t, str) and t.strip():
                lines.append(t.strip())
                continue

            # Check for content attribute
            c = getattr(part, "content", None)
            if isinstance(c, str) and c.strip():
                lines.append(c.strip())
                continue

            # Fallback to string conversion
            s = str(part).strip()
            if s:
                lines.append(s)

        # Join all lines and return
        return "\n".join(lines).strip()

    # Return string of content for other types
    return str(content).strip()


# ------------------- Helper functions for each provider ------------------ #

# OpenAI chat model
def build_openai_model(model: str, temperature: float, max_output_tokens: Optional[int], timeout: Optional[float]):
    """ Build and return an OpenAI chat model with text response format. """

    from langchain_openai import ChatOpenAI

    # Return the OpenAI chat model with text response format
    return ChatOpenAI(
        model=model,
        temperature=temperature,
        max_tokens=max_output_tokens,
        timeout=timeout,
        max_retries=2,
        model_kwargs={
            "response_format": {"type": "text"},
        },
    )

# Anthropic chat model
def build_anthropic_model(model: str, temperature: float, max_output_tokens: Optional[int], timeout: Optional[float]):
    """ Build and return an Anthropic chat model. """
    
    from langchain_anthropic import ChatAnthropic

    # Return the Anthropic chat model
    return ChatAnthropic(
        model=model,
        temperature=temperature,
        max_tokens=max_output_tokens,
        timeout=timeout,
        max_retries=2,
    )

# Google Gemini AI chat model
def build_gemini_model(model: str, temperature: float, max_output_tokens: Optional[int], timeout: Optional[float]):
    """ Build and return a Google Gemini AI chat model with text/plain response."""

    from langchain_google_genai import ChatGoogleGenerativeAI

    # Return the Google Gemini AI chat model with text/plain response
    return ChatGoogleGenerativeAI(
        model=model,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        timeout=timeout,
        max_retries=2,
        generation_config={
            "response_mime_type": "text/plain",
        },
    )

# Cohere chat model
def build_cohere_model(model: str, temperature: float, max_output_tokens: Optional[int], timeout: Optional[float]):
    """ Build and return a Cohere chat model. """

    from langchain_cohere import ChatCohere

    # Return the Cohere chat model
    return ChatCohere(
        model=model,
        temperature=temperature,
        max_tokens=max_output_tokens,
        timeout=timeout,
        max_retries=2,
    )


#  ------------------- Get chat LLM ------------------ #
def get_llm(
    model: str | None = None,
    temperature: float | None = None,
    max_output_tokens: int | None = None,
    timeout: float | None = None,
):
    """ Get the chat LLM from config or parameters. Parameters override config."""

    # Load config settings
    cfg = load_config() or {}

    # Extract LLM config
    llm_cfg = (cfg.get("llm") or {}) if isinstance(cfg, dict) else {}

    # Determine provider, model, temperature, and max tokens - with fallbacks
    provider = (llm_cfg.get("provider") or "openai")
    _model = model or llm_cfg.get("model") or "gpt-4o-mini"
    _temp = float(temperature if temperature is not None else llm_cfg.get("temperature", 0.2))
    _max = int(max_output_tokens if max_output_tokens is not None else llm_cfg.get("max_output_tokens", 800))

    # Build and return the chat LLM
    return build_llm(
        provider=provider,
        model=_model,
        temperature=_temp,
        max_output_tokens=_max,
        timeout=timeout,
    )

# Define __all__ for exports
__all__ = [
    "build_llm",
    "get_llm",
    "invoke_text",
    "coerce_content_to_text",
]
