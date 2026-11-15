import os
from typing import List
import numpy as np
import config

# In-memory embedding cache to avoid duplicate API calls
_embedding_cache = {}
_gemini_quota_exhausted = False

def get_embedding(text: str) -> List[float]:
    """
    Generates embedding vector for the input text.
    If GOOGLE_API_KEY is configured and within quota, uses Gemini's 'gemini-embedding-001'.
    Otherwise, gracefully falls back to a zero vector for keyword search.
    """
    global _gemini_quota_exhausted
    text = text.replace("\n", " ").strip()
    if not text:
        return [0.0] * config.EMBEDDING_DIMENSION

    if text in _embedding_cache:
        return _embedding_cache[text]

    if _gemini_quota_exhausted:
        emb = [0.0] * config.EMBEDDING_DIMENSION
        _embedding_cache[text] = emb
        return emb

    # Case 1: Google Gemini Embedding API
    if config.is_gemini_embedding_configured():
        try:
            import warnings
            warnings.filterwarnings("ignore", category=FutureWarning)
            import google.generativeai as genai
            genai.configure(api_key=config.GOOGLE_API_KEY)
            
            result = genai.embed_content(
                model="models/gemini-embedding-001",
                content=text,
                task_type="retrieval_query",
                output_dimensionality=config.EMBEDDING_DIMENSION
            )
            emb = result['embedding']
            _embedding_cache[text] = emb
            return emb
        except Exception as e:
            err_str = str(e).lower()
            _gemini_quota_exhausted = True
            if "429" in err_str or "quota" in err_str or "resourceexhausted" in err_str:
                print("Gemini embedding quota reached. Seamlessly switching to keyword-based retrieval.", flush=True)
            else:
                print(f"Gemini embedding unavailable. Seamlessly switching to keyword-based retrieval.", flush=True)

    emb = [0.0] * config.EMBEDDING_DIMENSION
    _embedding_cache[text] = emb
    return emb

def batch_get_embeddings(texts: List[str], batch_size: int = 40) -> List[List[float]]:
    """
    Generates embeddings for multiple texts in batches.
    Includes instant circuit breaker so quota limits never stall execution.
    """
    global _gemini_quota_exhausted
    results: List[List[float]] = []
    missing_indices = []
    missing_texts = []

    for i, text in enumerate(texts):
        cleaned = text.replace("\n", " ").strip()
        if not cleaned or _gemini_quota_exhausted:
            results.append([0.0] * config.EMBEDDING_DIMENSION)
        elif cleaned in _embedding_cache:
            results.append(_embedding_cache[cleaned])
        else:
            results.append(None)
            missing_indices.append(i)
            missing_texts.append(cleaned)

    if missing_texts and not _gemini_quota_exhausted and config.is_gemini_embedding_configured():
        try:
            import warnings
            warnings.filterwarnings("ignore", category=FutureWarning)
            import google.generativeai as genai
            genai.configure(api_key=config.GOOGLE_API_KEY)

            for b_start in range(0, len(missing_texts), batch_size):
                if _gemini_quota_exhausted:
                    break
                b_texts = missing_texts[b_start:b_start + batch_size]
                b_indices = missing_indices[b_start:b_start + batch_size]
                try:
                    res = genai.embed_content(
                        model="models/gemini-embedding-001",
                        content=b_texts,
                        task_type="retrieval_query",
                        output_dimensionality=config.EMBEDDING_DIMENSION
                    )
                    embs = res.get("embedding", [])
                    for idx, emb, txt in zip(b_indices, embs, b_texts):
                        _embedding_cache[txt] = emb
                        results[idx] = emb
                except Exception as e:
                    err_str = str(e).lower()
                    if "429" in err_str or "quota" in err_str or "resourceexhausted" in err_str:
                        _gemini_quota_exhausted = True
                        print("Gemini API daily quota limit reached. Using fast keyword retrieval.", flush=True)
                        break
                    # For non-quota errors, fill this batch with placeholders
                    for idx, txt in zip(b_indices, b_texts):
                        zero_emb = [0.0] * config.EMBEDDING_DIMENSION
                        _embedding_cache[txt] = zero_emb
                        results[idx] = zero_emb
        except Exception:
            pass

    # Ensure all remaining slots have placeholder vectors
    for i in range(len(results)):
        if results[i] is None:
            results[i] = [0.0] * config.EMBEDDING_DIMENSION

    return results

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
