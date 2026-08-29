import os
from typing import List
import numpy as np
import config

def get_embedding(text: str) -> List[float]:
    """
    Generates embedding vector for the input text.
    If GOOGLE_API_KEY is configured, it will use Gemini's 'gemini-embedding-001'
    to match the teammate's document_chunks embeddings.
    Otherwise, it falls back to a zero placeholder vector.
    """
    text = text.replace("\n", " ").strip()
    if not text:
        return [0.0] * config.EMBEDDING_DIMENSION

    # Case 1: Google Gemini Embedding API
    if config.is_gemini_embedding_configured():
        try:
            import google.generativeai as genai
            genai.configure(api_key=config.GOOGLE_API_KEY)
            
            # Using retrieval_query for similarity search query matching
            result = genai.embed_content(
                model="models/gemini-embedding-001",
                content=text,
                task_type="retrieval_query",
                output_dimensionality=config.EMBEDDING_DIMENSION
            )
            return result['embedding']
        except Exception as e:
            print(f"Gemini embedding API call failed: {e}. Checking fallbacks...")

    # Fallback placeholder vector of the configured dimension
    return [0.0] * config.EMBEDDING_DIMENSION

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calculates the cosine similarity between two vectors."""
    a = np.array(v1)
    b = np.array(v2)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(dot / (norm_a * norm_b))
