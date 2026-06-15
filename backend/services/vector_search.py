import json
import numpy as np
import time
import re
import math
from typing import List, Dict, Any
from db import db_client

# In-memory cache for document embeddings to ensure high retrieval performance
_cached_embeddings: List[Dict[str, Any]] = []
_bm25_searcher = None

# Query TTL Cache
_query_cache = {}
CACHE_TTL = 300  # 5 minutes in-memory cache

class BM25Searcher:
    def __init__(self, corpus: list):
        self.k1 = 1.5
        self.b = 0.75
        self.corpus_size = len(corpus)
        self.doc_lens = [len(self._tokenize(doc)) for doc in corpus]
        self.avg_doc_len = sum(self.doc_lens) / self.corpus_size if self.corpus_size > 0 else 1.0
        
        self.doc_term_freqs = []
        self.doc_frequencies = {}
        
        for doc in corpus:
            tokens = self._tokenize(doc)
            freqs = {}
            for token in tokens:
                freqs[token] = freqs.get(token, 0) + 1
            self.doc_term_freqs.append(freqs)
            
            for token in freqs.keys():
                self.doc_frequencies[token] = self.doc_frequencies.get(token, 0) + 1
                
    def _tokenize(self, text: str) -> list:
        return re.findall(r'\w+', text.lower())
        
    def _idf(self, word: str) -> float:
        n = self.doc_frequencies.get(word, 0)
        return math.log((self.corpus_size - n + 0.5) / (n + 0.5) + 1.0)
        
    def get_score(self, doc_idx: int, query_tokens: list) -> float:
        score = 0.0
        doc_len = self.doc_lens[doc_idx]
        freqs = self.doc_term_freqs[doc_idx]
        
        for token in query_tokens:
            if token in freqs:
                tf = freqs[token]
                idf = self._idf(token)
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / self.avg_doc_len))
                score += idf * (numerator / denominator)
        return score

def load_embeddings_cache():
    global _cached_embeddings, _bm25_searcher
    if _cached_embeddings:
        return
        
    print("[Vector Search] Lazily initializing document chunk embeddings cache...", flush=True)
    try:
        sql = "SELECT chunk_id, document_name, page_number, text_content, metadata_json, embedding FROM rag_document_embeddings;"
        result = db_client.execute(sql)
        rows = result.fetchall()
        
        cache = []
        corpus_texts = []
        for r in rows:
            chunk_id = r[0]
            document_name = r[1]
            page_number = r[2]
            text_content = r[3]
            metadata_json = r[4]
            embedding_str = r[5]
            
            # Embeddings are stored as stringified JSON lists in Catalyst / SQLite
            if isinstance(embedding_str, str):
                try:
                    embedding = json.loads(embedding_str)
                except Exception:
                    continue
            else:
                embedding = embedding_str
                
            if isinstance(metadata_json, str):
                try:
                    metadata = json.loads(metadata_json)
                except Exception:
                    metadata = {}
            else:
                metadata = metadata_json or {}
                
            cache.append({
                "chunk_id": chunk_id,
                "document_name": document_name,
                "page_number": page_number,
                "text_content": text_content,
                "metadata_json": metadata,
                "embedding": np.array(embedding, dtype=np.float32)
            })
            corpus_texts.append(text_content)
            
        _cached_embeddings = cache
        _bm25_searcher = BM25Searcher(corpus_texts)
        print(f"[Vector Search] Loaded {len(_cached_embeddings)} chunks into cache and built BM25 index.", flush=True)
    except Exception as e:
        print(f"[Vector Search] Error loading embeddings from database: {e}", flush=True)

def is_vector_search_ready() -> bool:
    load_embeddings_cache()
    return len(_cached_embeddings) > 0

def search_hybrid_similarity(query_text: str, query_vector: List[float], top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Combines Cosine Similarity (Semantic Search) and BM25 (Keyword Search) to rank document chunks.
    Final Ranking Score: 0.7 * semantic_score + 0.3 * keyword_score
    """
    now = time.time()
    # Check TTL cache
    if query_text in _query_cache:
        cached_results, expiry = _query_cache[query_text]
        if now < expiry:
            return cached_results[:top_k]
            
    load_embeddings_cache()
    
    if not _cached_embeddings:
        print("[Vector Search] Warning: Embedding cache is empty.", flush=True)
        return []
        
    query_arr = np.array(query_vector, dtype=np.float32)
    query_norm = np.linalg.norm(query_arr)
    
    # Calculate BM25 scores
    query_tokens = re.findall(r'\w+', query_text.lower())
    bm25_scores = [_bm25_searcher.get_score(idx, query_tokens) for idx in range(len(_cached_embeddings))]
    max_bm25 = max(bm25_scores) if bm25_scores else 0.0
    
    results = []
    for idx, chunk in enumerate(_cached_embeddings):
        emb_arr = chunk["embedding"]
        emb_norm = np.linalg.norm(emb_arr)
        
        # 1. Semantic score (cosine similarity)
        if emb_norm == 0 or query_norm == 0:
            similarity = 0.0
        else:
            similarity = np.dot(query_arr, emb_arr) / (query_norm * emb_norm)
            
        # 2. Keyword score (BM25 score normalized to [0, 1])
        k_score = (bm25_scores[idx] / max_bm25) if max_bm25 > 0.0 else 0.0
        
        # 3. Hybrid score combination (70/30 weight)
        combined_score = 0.7 * similarity + 0.3 * k_score
        
        metadata = chunk["metadata_json"]
        source_type = metadata.get("source_type", "pdf")
        
        # Determine explicit metadata fields for quality compliance
        page = chunk["page_number"] if source_type not in ["excel", "csv", "shapefile", "kml", "geojson"] else None
        sheet = metadata.get("sheet_name")
        row = metadata.get("row_number")
        
        results.append({
            "chunk_id": chunk["chunk_id"],
            "source_file": chunk["document_name"],
            "page_number": chunk["page_number"],
            "source": chunk["document_name"],
            "page": page,
            "sheet": sheet,
            "row": row,
            "confidence": float(combined_score),
            "chunk_text": chunk["text_content"],
            "metadata": metadata,
            "score": float(combined_score)
        })
        
    # Sort by hybrid score in descending order
    results.sort(key=lambda x: x["score"], reverse=True)
    
    # Deduplicate highly similar chunks (similarity > 0.98 or exact text matching)
    deduplicated = []
    seen_texts = set()
    for item in results:
        # Standardize text for comparisons
        text_norm = re.sub(r'\s+', ' ', item["chunk_text"].strip().lower())
        if text_norm in seen_texts:
            continue
        seen_texts.add(text_norm)
        deduplicated.append(item)
        
    # Cache the final deduplicated results
    _query_cache[query_text] = (deduplicated, now + CACHE_TTL)
    
    return deduplicated[:top_k]
