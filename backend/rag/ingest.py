import os
import fitz  # PyMuPDF
try:
    from backend.db import db_client
    from backend.rag.chunker import chunk_text
    from backend.rag.embeddings import get_embeddings
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from db import db_client
    from rag.chunker import chunk_text
    from rag.embeddings import get_embeddings

import json

PDF_FILES = [
    "CrimeinIndia2024-VolumeI1.pdf",
    "2CrimeinIndia2024-VolumeII.pdf",
    "3CrimeinIndia2024-VolumeIII1.pdf",
    "ACID ATTACK.pdf",
    "Human Trafficking.pdf",
    "Medical Professionals.pdf",
    "Organised crime.pdf",
    "Proclaimed Offender.pdf",
    "SEXUAL HARASSMENST.pdf",
    "Snatching.pdf",
    "Stakehoder Driven Reforms corrected.pdf",
    "Technology.pdf",
    "Terrorism.pdf"
]

def ingest_pdfs(limit_pages_per_pdf: int = None):
    """
    Extracts text page-by-page from available PDFs, chunks them, generates 
    all-MiniLM-L6-v2 embeddings, and inserts into Catalyst Data Store.
    """
    workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    print(f"Workspace root: {workspace_root}")
    
    # Get the next chunk_id starting sequence
    res_max = db_client.execute("SELECT MAX(chunk_id) FROM rag_document_embeddings;")
    max_row = res_max.fetchone()
    next_chunk_id = (max_row[0] or 0) + 1 if max_row else 1
    
    for pdf_name in PDF_FILES:
        pdf_path = os.path.join(workspace_root, pdf_name)
        if not os.path.exists(pdf_path):
            print(f"PDF not found: {pdf_name} at {pdf_path}, skipping...")
            continue
            
        print(f"\nProcessing PDF: {pdf_name}")
        try:
            doc = fitz.open(pdf_path)
        except Exception as e:
            print(f"Error opening PDF {pdf_name}: {e}")
            continue
            
        total_pages = len(doc)
        print(f"Total pages: {total_pages}")
        
        # Check if already ingested to avoid duplicates
        res = db_client.execute("SELECT COUNT(*) FROM rag_document_embeddings WHERE document_name = :doc_name;", {"doc_name": pdf_name})
        count = res.fetchone()[0]
        if count > 0:
            print(f"PDF {pdf_name} already ingested ({count} chunks). Skipping...")
            doc.close()
            continue
            
        pages_to_process = total_pages
        if limit_pages_per_pdf:
            pages_to_process = min(total_pages, limit_pages_per_pdf)
            print(f"Limiting ingestion to first {pages_to_process} pages for testing.")
            
        for page_num in range(pages_to_process):
            page = doc[page_num]
            text = page.get_text()
            if not text.strip():
                continue
                
            chunks = chunk_text(text, chunk_size=512, overlap=50)
            if not chunks:
                continue
                
            print(f"Page {page_num + 1}/{pages_to_process}: generated {len(chunks)} chunks.")
            embeddings = get_embeddings(chunks)
            
            for chunk_txt, emb in zip(chunks, embeddings):
                # Convert embedding floats array to JSON string for storage in Catalyst Datastore
                emb_json = json.dumps(emb.tolist() if hasattr(emb, "tolist") else list(emb))
                
                db_client.execute(
                    """
                    INSERT INTO rag_document_embeddings (chunk_id, document_name, page_number, text_content, embedding)
                    VALUES (:chunk_id, :doc_name, :page_num, :text_content, :embedding);
                    """,
                    {
                        "chunk_id": next_chunk_id,
                        "doc_name": pdf_name,
                        "page_num": page_num + 1,
                        "text_content": chunk_txt,
                        "embedding": emb_json
                    }
                )
                next_chunk_id += 1
            
        doc.close()
        print(f"Finished ingesting {pdf_name}")
        
    print("Ingestion complete.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-pages", type=int, default=None, help="Limit number of pages processed per PDF (for quick testing)")
    args = parser.parse_args()
    
    ingest_pdfs(limit_pages_per_pdf=args.limit_pages)
