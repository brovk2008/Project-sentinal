from typing import List, Dict, Any

try:
    from backend.rag.embeddings import get_embedding
    from backend.services.vector_search import search_hybrid_similarity
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from rag.embeddings import get_embedding
    from services.vector_search import search_hybrid_similarity

def search_chunks(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Computes query embedding and performs a NumPy hybrid semantic-keyword similarity search 
    against the Catalyst-stored `rag_document_embeddings` table.
    """
    try:
        query_vector = get_embedding(query)
    except Exception as e:
        print(f"[Retriever Log] Error generating embedding for query: {e}")
        return []
        
    try:
        print(f"[Retriever Log] Running hybrid similarity search for top {top_k} matches...")
        results = search_hybrid_similarity(query, query_vector, top_k=top_k)
        print(f"[Retriever Log] Retrieved {len(results)} chunks successfully.")
        return results
    except Exception as e:
        print(f"[Retriever Log] Error during similarity search computation: {e}")
        return []

