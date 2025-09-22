# Import necessary modules
from __future__ import annotations
from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Function to chunk texts
def chunk_texts(
    texts: List[str],
    chunk_size: int = 1200,
    chunk_overlap: int = 200,
) -> List[str]:
    """
    Chunk the input texts into smaller overlapping pieces
    """
    # Initialize the text splitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", " ", ""],
    )

    # Split each text and collect chunks
    chunks: List[str] = []

    # Iterate over texts and split
    for t in texts:
        if not t:
            continue
        chunks.extend(splitter.split_text(t))

    # Return the list of chunks
    return chunks
