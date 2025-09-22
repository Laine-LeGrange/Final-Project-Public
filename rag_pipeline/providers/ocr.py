# Import required modules and libraries
from __future__ import annotations
from typing import Optional, Literal
from pathlib import Path
import base64
import os
import re

# Import Mistral client
from mistralai import Mistral

# Define supported OCR provider
OCRProvider = Literal["mistral", "none"]

# Extract file type from path
def extract_file_type(path: str | None) -> str:
    """Extract the file type from the file extension. Defaults to PNG if unknown."""
    if not path:
        return "image/png"
    ext = Path(path).suffix.lower()
    if ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    return "image/png"


# Image data is sent to OCR as bytes to keep modularity
# ensures future support for other providers is easy

# Convert raw image bytes to a data URL
def convert_bytes_to_url(image_bytes: bytes, file_type: str) -> str:
    """Convert raw image bytes to a data URL for OCR processing."""
    b64 = base64.b64encode(image_bytes).decode("ascii") # OCR models all accept base64
    return f"data:{file_type};base64,{b64}"

#  -------- OCR function using Mistral's OCR API --------
def image_to_text(
    image_path: Optional[str] = None,
    *,
    image_bytes: Optional[bytes] = None,
    provider: OCRProvider = "mistral",
    model: str = "mistral-ocr-latest",
    prompt: str | None = None,
    file_type: Optional[str] = None,
) -> str:
    """
    OCR for image to text using Mistral's OCR API.
    - Accepts a filesystem path or raw bytes.
    - Returns plain text.
    """

    # Handle disabled or unsupported providers
    if provider == "none":
        return "[OCR disabled]"
    if provider != "mistral": # only Mistral supported currently
        return f"[OCR provider '{provider}' not supported]"

    # Load image bytes if a path is provided
    if image_bytes is None and image_path:
        try:
            image_bytes = Path(image_path).read_bytes()
        except Exception as e:
            # Handle file read errors
            return f"[OCR error: could not read file: {e}]"
    if not image_bytes:
        return "[OCR error: no image provided]"

    # Build data URL
    file_type = file_type or extract_file_type(image_path)
    data_url = convert_bytes_to_url(image_bytes, file_type)

    # Get Mistral API key from env
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        return "[OCR error: MISTRAL_API_KEY not set]"

    try:
        # Instantiate Mistral client
        client = Mistral(api_key=api_key)

        # Call the OCR process method
        resp = client.ocr.process(
            model=model,
            document={"type": "image_url", "image_url": data_url},
            include_image_base64=False,
        )

        # Extract text from response
        pages = getattr(resp, "pages", None)
        md_chunks: list[str] = []

        # Gather markdown from all pages
        if isinstance(pages, list):
            for p in pages:
                md = getattr(p, "markdown", None)
                if md is None and isinstance(p, dict):
                    md = p.get("markdown")
                if md:
                    md_chunks.append(md)

        # Join all markdown chunks
        text_md = "\n\n".join(md_chunks).strip()
        if not text_md:
            text_md = (getattr(resp, "markdown", "") or getattr(resp, "text", "") or "").strip()

        # Handle empty text
        if not text_md:
            return "[OCR produced no text]"

        # Convert md to plain text
        text_plain = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text_md).strip()
        return text_plain or "[OCR produced no text]"

    # Handle any exceptions thrown during OCR
    except Exception as e:
        return f"[OCR error: {type(e).__name__}: {e}]"
