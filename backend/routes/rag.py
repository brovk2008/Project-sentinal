from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from db import get_db

try:
    from backend.rag.router import route_query, execute_analytics
    from backend.rag.retriever import search_chunks
    from backend.rag.answer_generator import generate_answer, is_groq_available
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from rag.router import route_query, execute_analytics
    from rag.retriever import search_chunks
    from rag.answer_generator import generate_answer, is_groq_available

router = APIRouter(tags=["Intelligence Assistant"])

class QueryRequest(BaseModel):
    question: str

class AnalyzeRequest(BaseModel):
    query: str

class BriefingRequest(BaseModel):
    topic: str

@router.get("/health")
def health_check(db = Depends(get_db)):
    """
    Checks the connectivity of the Catalyst Data Store/SQLite local replica 
    and the status of the Groq API provider, Vector Search cache, and File Store.
    """
    import os
    try:
        from backend.services.vector_search import is_vector_search_ready
        from backend.services.llm import LLMService
    except ImportError:
        from services.vector_search import is_vector_search_ready
        from services.llm import LLMService

    # 1. Datastore Check
    datastore_status = "offline"
    try:
        db.execute("SELECT 1;")
        datastore_status = "online"
    except Exception as e:
        print(f"[Health Check] Datastore offline: {e}")
        
    # 2. Filestore Check
    filestore_status = "offline"
    try:
        if db.is_production:
            if db._app:
                db._app.filestore().get_all_folders()
                filestore_status = "online"
        else:
            if os.path.exists(db.sqlite_path):
                filestore_status = "online"
    except Exception as e:
        print(f"[Health Check] Filestore offline: {e}")
        
    # 3. Groq Check
    groq_status = "available" if LLMService.is_available() else "offline"
    
    # 4. Vector Search Cache Check
    vector_search_status = "ready" if is_vector_search_ready() else "not_ready"
    
    # Overall status
    status = "healthy" if (datastore_status == "online" and vector_search_status == "ready") else "unhealthy"
    
    return {
        "status": status,
        "catalyst_datastore": datastore_status,
        "catalyst_filestore": filestore_status,
        "groq_api": groq_status,
        "vector_search": vector_search_status
    }

@router.get("/search")
def search(q: str = Query(..., min_length=1), limit: int = Query(5, le=20)):
    """
    Performs raw semantic vector search on crime intelligence documents.
    """
    results = search_chunks(q, top_k=limit)
    return {
        "query": q,
        "results": results
    }

@router.post("/query")
def query_endpoint(req: QueryRequest):
    """
    RAG Query interface that automatically routes questions to SQL stats, 
    document context, or hybrid formats, returning answers with citations.
    """
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
        
    intent_type, payload = route_query(question)
    
    if intent_type == "analytics":
        res = execute_analytics(payload)
        
        # Format the analytical response as a text answer as well
        answer_text = f"**Database Analytics Result for {res.get('district', 'State')}**\n\n"
        data_rows = res.get("data", [])
        if data_rows:
            headers = res["columns"]
            # simple markdown table format
            answer_text += " | ".join([f"**{h}**" for h in headers]) + "\n"
            answer_text += " | ".join(["---"] * len(headers)) + "\n"
            for row in data_rows[:10]:
                answer_text += " | ".join([str(row.get(h, '')) for h in headers]) + "\n"
        else:
            answer_text += "*No matching records found in database.*"
            
        return {
            "question": question,
            "answer": answer_text,
            "sources": ["PostgreSQL Sentinel Database"],
            "confidence": 1.0,
            "mode": "db_analytics_sql",
            "analytics_data": res
        }
        
    elif intent_type == "hybrid":
        db_res = execute_analytics(payload)
        db_context = ""
        if "data" in db_res:
            db_context = "Database statistics:\n" + "\n".join([f"- {row.get('metric', '')}: {row.get('value', '')}" for row in db_res["data"]])
            
        chunks = search_chunks(question, top_k=5)
        ans = generate_answer(question, chunks, db_context=db_context)
        ans["analytics_data"] = db_res
        return ans
        
    else:  # intent_type == "knowledge"
        chunks = search_chunks(question, top_k=5)
        ans = generate_answer(question, chunks)
        return ans

@router.post("/analyze")
def analyze_endpoint(req: AnalyzeRequest):
    """
    Performs target database analytics calculations on the user request.
    """
    query_text = req.query.strip()
    intent_type, payload = route_query(query_text)
    
    if intent_type == "analytics" or intent_type == "hybrid":
        res = execute_analytics(payload)
        return {
            "query": query_text,
            "analytics_data": res,
            "status": "success"
        }
    else:
        # General district stats fallback
        fallback_payload = {
            "type": "general_profile",
            "query": "SELECT district_name, total_firs, total_arrested, total_victims FROM mv_district_profile LIMIT 10;",
            "params": ()
        }
        res = execute_analytics(fallback_payload)
        return {
            "query": query_text,
            "analytics_data": res,
            "status": "fallback"
        }

@router.post("/briefing")
def briefing_endpoint(req: BriefingRequest):
    """
    Generates a structured, multi-section Intelligence Briefing from official documents.
    """
    import urllib.request
    import json
    
    topic = req.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Topic cannot be empty.")
        
    chunks = search_chunks(topic, top_k=6)
    
    context_str = ""
    sources = []
    for idx, c in enumerate(chunks):
        src = f"{c['source_file']} (Page {c['page_number']})"
        sources.append(src)
        context_str += f"\n[Document {idx+1}: {src}]\n{c['chunk_text']}\n"
        
    avg_score = sum([c['score'] for c in chunks]) / len(chunks) if chunks else 0.0
    
    if is_groq_available():
        prompt = f"""You are an expert intelligence analyst for Project Sentinel.
You must compile a formal, highly-detailed intelligence briefing regarding the topic: "{topic}".
Your briefing must follow this exact structure:

# EXECUTIVE SUMMARY
[Provide a high-level summary of the threat landscape or findings based on the documents]

# KEY FINDINGS
[Detail 3 specific findings, each supported by facts/statistics from the documents. Cite the source files in parentheses e.g. (Terrorism.pdf, Page 3)]

# RISK INDICATORS
[List 2 threat indicators or vulnerabilities identified in the source materials]

# RECOMMENDED ACTIONS
[List 3 actionable, professional recommendations for police/law enforcement]

Sources: {", ".join(list(set(sources)))}
Confidence Level: {int(avg_score * 100)}%

Evidence:
{context_str}
"""
        try:
            from backend.services.llm import LLMService
        except ImportError:
            from services.llm import LLMService
        briefing_text = LLMService.generate(prompt)
        
        if briefing_text:
            return {
                "topic": topic,
                "briefing": briefing_text,
                "sources": list(set(sources)),
                "confidence": avg_score,
                "mode": "llm_generated"
            }
        else:
            print("Groq briefing generation failed/timed out.")
            # Fall through to fallback briefing
            
    # Fallback Briefing Mode
    briefing_text = f"""# INTELLIGENCE BRIEFING: {topic.upper()}

## EXECUTIVE SUMMARY
This briefing provides structured source intelligence extracted from official documents on the topic of {topic}. 

## KEY FINDINGS
"""
    for idx, c in enumerate(chunks[:3]):
        briefing_text += f"\n### Finding {idx+1} (Source: {c['source_file']}, Page {c['page_number']})\n{c['chunk_text']}\n"
        
    briefing_text += """
## RISK INDICATORS
- High occurrence of threat vectors mentioned in source documentation.
- Limited enforcement mechanisms identified in preliminary source analysis.

## RECOMMENDED ACTIONS
1. Coordinate state intelligence networks with central authorities.
2. Implement strict border vigilance and coastal monitoring.
3. Deploy specialized policing units to handle the identified risk indicators.
"""
    return {
        "topic": topic,
        "briefing": briefing_text,
        "sources": list(set(sources)),
        "confidence": avg_score,
        "mode": "fallback_retrieval_only"
    }
