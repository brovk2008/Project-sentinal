import os
import shutil
import time
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from services.rag_processor import process_and_index_file, search_case_rag
from db import db_client

router = APIRouter(tags=["Memory v2"])

def run_indexing_in_background(case_id: str, file_path: str, doc_name: str):
    def progress_callback(progress: float, message: str, status: str = "indexing"):
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        db_client.execute(
            """
            UPDATE document_indexing_status
            SET status = :status, progress = :progress, status_message = :message, updated_at = :updated_at
            WHERE document_name = :doc_name AND case_id = :case_id;
            """,
            {"status": status, "progress": progress, "message": message, "updated_at": now, "doc_name": doc_name, "case_id": case_id}
        )

    try:
        success = process_and_index_file(case_id, file_path, doc_name, progress_callback)
        if success:
            progress_callback(100.0, "Document indexed successfully.", "completed")
        else:
            progress_callback(0.0, "Failed to extract text from file.", "failed")
    except Exception as e:
        progress_callback(0.0, f"Indexing failed: {str(e)}", "failed")
    finally:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

@router.post("/documents")
async def upload_document(case_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # Validate extension
    filename = file.filename
    _, ext = os.path.splitext(filename)
    allowed_extensions = {
        ".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".geojson", ".xml", ".kml",
        ".shp", ".dbf", ".shx", ".zip", ".png", ".jpg", ".jpeg", ".jfif",
        ".mp3", ".wav", ".m4a", ".mp4", ".mov", ".avi", ".webm"
    }
    if not ext or ext.lower() not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed types: {', '.join(sorted(allowed_extensions))}"
        )

    # Local upload path setup
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, file.filename)
    try:
        max_size = 100 * 1024 * 1024
        contents = await file.read()
        if len(contents) > max_size:
            raise HTTPException(
                status_code=413,
                detail="File too large. Maximum size allowed is 100MB."
            )
        with open(file_path, "wb") as buffer:
            buffer.write(contents)
            
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        # Record initial status
        db_client.execute(
            """
            INSERT OR REPLACE INTO document_indexing_status (document_name, case_id, status, progress, status_message, created_at, updated_at)
            VALUES (:document_name, :case_id, 'indexing', 10.0, 'File saved to disk. Queuing for parsing...', :created_at, :created_at);
            """,
            {"document_name": file.filename, "case_id": case_id, "created_at": now}
        )
        
        # Enqueue background task
        background_tasks.add_task(run_indexing_in_background, case_id, file_path, file.filename)
        
        return {"status": "queued", "document_name": file.filename}
    except Exception as e:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/documents/status")
def get_documents_status(case_id: str):
    try:
        # 1. Fetch statuses from document_indexing_status
        status_sql = "SELECT document_name, status, progress, status_message, updated_at FROM document_indexing_status WHERE case_id = :case_id;"
        status_res = db_client.execute(status_sql, {"case_id": case_id})
        status_rows = status_res.fetchall()
        
        indexed_docs = {}
        for r in status_rows:
            indexed_docs[r[0]] = {
                "document_name": r[0],
                "status": r[1],
                "progress": r[2],
                "status_message": r[3],
                "updated_at": r[4]
            }
            
        # 2. Fallback to v2_rag_embeddings to capture pre-existing files
        emb_sql = "SELECT DISTINCT document_name FROM v2_rag_embeddings WHERE case_id = :case_id;"
        emb_res = db_client.execute(emb_sql, {"case_id": case_id})
        for r in emb_res.fetchall():
            doc_name = r[0]
            if doc_name not in indexed_docs:
                indexed_docs[doc_name] = {
                    "document_name": doc_name,
                    "status": "completed",
                    "progress": 100.0,
                    "status_message": "Indexed",
                    "updated_at": ""
                }
                
        return list(indexed_docs.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/documents/chunks")
def get_document_chunks(case_id: str, document_name: str):
    try:
        sql = "SELECT chunk_id, page_number, text_content FROM v2_rag_embeddings WHERE case_id = :case_id AND document_name = :document_name ORDER BY ROWID ASC;"
        res = db_client.execute(sql, {"case_id": case_id, "document_name": document_name})
        rows = res.fetchall()
        
        chunks = []
        for r in rows:
            chunks.append({
                "chunk_id": r[0],
                "page_number": r[1],
                "text_content": r[2]
            })
        return chunks
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search")
def search_case_memory(case_id: str, q: str):
    try:
        results = search_case_rag(case_id, q, top_k=5)
        return [
            {
                "chunk_id": r["chunk_id"],
                "document_name": r["source_file"],
                "page_number": r["page_number"],
                "text_content": r["text_content"],
                "score": r["score"]
            }
            for r in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

