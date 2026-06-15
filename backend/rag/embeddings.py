"""
RAG Embeddings Module — gracefully degrades if sentence-transformers is unavailable.
On Catalyst AppSail, torch+sentence-transformers may exceed memory/disk limits.
The rest of the API will still work; RAG search will return an error.
"""

_model = None
_st_available = False

try:
    from sentence_transformers import SentenceTransformer
    _st_available = True
except ImportError:
    print("[EMBEDDINGS] sentence-transformers not available — RAG vector search disabled")
    SentenceTransformer = None

import urllib.request
import json
import os
from typing import Any

def get_huggingface_embedding(inputs: Any) -> Any:
    # Use the new Hugging Face Inference API router endpoint with explicit pipeline task
    url = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"
    payload = {
        "inputs": inputs,
        "options": {"wait_for_model": True}
    }
    data_bytes = json.dumps(payload).encode('utf-8')
    
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "ProjectSentinel/2.0"
    }
    
    # Retrieve optional Hugging Face API token from environment variable
    hf_token = os.getenv("HF_TOKEN")
    if hf_token:
        headers["Authorization"] = f"Bearer {hf_token}"
        
    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers=headers
    )
    with urllib.request.urlopen(req, timeout=12.0) as res:
        return json.loads(res.read().decode('utf-8'))

def get_model():
    global _model
    if not _st_available:
        raise RuntimeError("sentence-transformers is not installed on this runtime")
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model

def get_embedding(text: str) -> list:
    """
    Generates a 384-dimensional vector embedding for the input text.
    """
    if _st_available:
        model = get_model()
        vector = model.encode(text)
        return vector.tolist()
    else:
        try:
            return get_huggingface_embedding(text)
        except Exception as e:
            print(f"[EMBEDDINGS Fallback] HF Inference API failed: {e}")
            raise e

def get_embeddings(texts: list) -> list:
    """
    Generates embeddings in batch for a list of texts.
    """
    if _st_available:
        model = get_model()
        vectors = model.encode(texts)
        return [v.tolist() for v in vectors]
    else:
        try:
            return get_huggingface_embedding(texts)
        except Exception as e:
            print(f"[EMBEDDINGS Fallback] HF Inference API failed: {e}")
            raise e
