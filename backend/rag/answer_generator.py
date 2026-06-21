import os
from typing import List, Dict, Any
try:
    from backend.services.ai_router import ai_router
except ImportError:
    from services.ai_router import ai_router

def is_groq_available() -> bool:
    return ai_router.verify_health("groq")

def generate_answer(question: str, chunks: List[Dict[str, Any]], db_context: str = None) -> Dict[str, Any]:
    """
    Generates a grounded, citation-backed answer using LLMService. If generation fails,
    falls back to Retrieval-Only mode.
    """
    avg_score = sum([c['score'] for c in chunks]) / len(chunks) if chunks else 0.0
    
    context_str = ""
    sources = []
    for idx, c in enumerate(chunks):
        meta = c.get("metadata") or {}
        source_type = meta.get("source_type", "pdf")
        
        if source_type in ["excel", "csv"]:
            sheet_name = meta.get("sheet_name")
            row_num = meta.get("row_number") or c.get("page_number")
            if sheet_name:
                src = f"{c['source_file']} (Sheet: {sheet_name}, Row: {row_num})"
            else:
                src = f"{c['source_file']} (Row: {row_num})"
        elif source_type == "shapefile":
            layer_level = meta.get("level") or "Boundary"
            feature_name = meta.get("name") or "Unknown"
            src = f"{c['source_file']} (Layer: {layer_level}, Feature: {feature_name})"
        elif source_type == "kml":
            placemark_name = meta.get("name") or "Feature"
            src = f"{c['source_file']} (Placemark: {placemark_name})"
        elif source_type == "geojson":
            feature_name = meta.get("name") or "Feature"
            src = f"{c['source_file']} (Feature: {feature_name})"
        else:
            src = f"{c['source_file']} (Page {c['page_number']})"
            
        sources.append(src)
        context_str += f"\n[Document {idx+1}: {src}]\n{c['chunk_text']}\n"
        
    if db_context:
        context_str += f"\n[PostgreSQL Database Analytics Context]\n{db_context}\n"

    # Check if either Groq or Gemini is available
    if ai_router.verify_health("groq") or ai_router.verify_health("gemini"):
        prompt = f"""You are an expert intelligence assistant for Project Sentinel.
You must answer the user's question using ONLY the provided document and database evidence.
Every claim or statistic you generate MUST be directly supported by the text in the evidence.
Include citations using [Document X] format.
If the evidence does not contain the answer, say "Based on the retrieved documents, the answer is not available."
Do NOT make up any facts, numbers, or statistics.

Evidence:
{context_str}

Question: {question}
Answer:"""

        answer_text = ai_router.complete(prompt, provider="groq")
        
        if answer_text:
            return {
                "question": question,
                "answer": answer_text,
                "sources": list(set(sources)),
                "confidence": avg_score,
                "mode": "llm_grounded"
            }
            
    # Fallback Mode: Retrieval-Only structured response
    findings = []
    for idx, c in enumerate(chunks):
        meta = c.get("metadata") or {}
        source_type = meta.get("source_type", "pdf")
        if source_type in ["excel", "csv"]:
            sheet_name = meta.get("sheet_name")
            row_num = meta.get("row_number") or c.get("page_number")
            src = f"{c['source_file']} (Sheet: {sheet_name}, Row: {row_num})" if sheet_name else f"{c['source_file']} (Row: {row_num})"
        elif source_type == "shapefile":
            layer_level = meta.get("level") or "Boundary"
            feature_name = meta.get("name") or "Unknown"
            src = f"{c['source_file']} (Layer: {layer_level}, Feature: {feature_name})"
        elif source_type == "kml":
            placemark_name = meta.get("name") or "Feature"
            src = f"{c['source_file']} (Placemark: {placemark_name})"
        elif source_type == "geojson":
            feature_name = meta.get("name") or "Feature"
            src = f"{c['source_file']} (Feature: {feature_name})"
        else:
            src = f"{c['source_file']} (Page {c['page_number']})"
            
        findings.append(f"- From {src}: {c['chunk_text']}")
        
    findings_text = "No direct document matches found."
    if findings:
        findings_text = "Based on retrieved official intelligence sources:\n\n" + "\n\n".join(findings)
        if db_context:
            findings_text += f"\n\nAdditional database facts retrieved:\n{db_context}"
            
    return {
        "question": question,
        "answer": findings_text,
        "sources": list(set(sources)),
        "confidence": avg_score,
        "mode": "fallback_retrieval_only"
    }
