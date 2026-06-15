import os
import pandas as pd
import json
import numpy as np

try:
    from backend.db import db_client
    from backend.rag.embeddings import get_embeddings
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from db import db_client
    from rag.embeddings import get_embeddings

SPREADSHEETS = [
    {"file": "c52e6463-6456-46da-b907-96eef186a5d9.csv", "type": "csv"},
    {"file": "PCA_India.csv", "type": "csv"},
    {"file": "2011-IndiaState-0000.xlsx", "type": "xlsx"},
    {"file": "2011-IndiaStateDist-0000.xlsx", "type": "xlsx"},
    {"file": "2011-IndiaStateDistSbDist-0000.xlsx", "type": "xlsx"}
]

def format_row(row_dict: dict) -> str:
    parts = []
    for k, v in row_dict.items():
        if pd.isna(v) or str(v).strip() == "" or v is None:
            continue
        parts.append(f"{k}: {v}")
    return ", ".join(parts)

def ingest_spreadsheets():
    workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    print(f"[Spreadsheet Ingest] Workspace root: {workspace_root}", flush=True)
    
    # Get the next chunk_id sequence
    res_max = db_client.execute("SELECT MAX(chunk_id) FROM rag_document_embeddings;")
    max_row = res_max.fetchone()
    next_chunk_id = (max_row[0] or 0) + 1 if max_row else 1
    
    for item in SPREADSHEETS:
        file_name = item["file"]
        file_path = os.path.join(workspace_root, file_name)
        if not os.path.exists(file_path):
            # Try checking the parent directory if needed
            print(f"[Spreadsheet Ingest] File not found: {file_name}, skipping...", flush=True)
            continue
            
        print(f"\n[Spreadsheet Ingest] Processing: {file_name}", flush=True)
        
        # Check if already ingested
        res_check = db_client.execute("SELECT COUNT(*) FROM rag_document_embeddings WHERE document_name = :doc_name;", {"doc_name": file_name})
        count = res_check.fetchone()[0]
        if count > 0:
            print(f"[Spreadsheet Ingest] {file_name} already ingested ({count} chunks). Skipping...", flush=True)
            continue
            
        if item["type"] == "csv":
            try:
                skip = 4 if file_name == "PCA_India.csv" else 0
                df = pd.read_csv(file_path, skiprows=skip)
                process_dataframe(df, file_name, "Sheet1", next_chunk_id)
                # Query maximum chunk_id to update sequence
                res_max = db_client.execute("SELECT MAX(chunk_id) FROM rag_document_embeddings;")
                next_chunk_id = (res_max.fetchone()[0] or next_chunk_id) + 1
            except Exception as e:
                print(f"[Spreadsheet Ingest] Error reading CSV {file_name}: {e}", flush=True)
        elif item["type"] == "xlsx":
            try:
                xls = pd.ExcelFile(file_path)
                for sheet_name in xls.sheet_names:
                    print(f"  Processing sheet: {sheet_name}", flush=True)
                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                    process_dataframe(df, file_name, sheet_name, next_chunk_id)
                    # Update sequence
                    res_max = db_client.execute("SELECT MAX(chunk_id) FROM rag_document_embeddings;")
                    next_chunk_id = (res_max.fetchone()[0] or next_chunk_id) + 1
            except Exception as e:
                print(f"[Spreadsheet Ingest] Error reading Excel {file_name}: {e}", flush=True)
                
    print("[Spreadsheet Ingest] Spreadsheet ingestion pipeline completed successfully.")

def process_dataframe(df: pd.DataFrame, file_name: str, sheet_name: str, start_chunk_id: int):
    next_chunk_id = start_chunk_id
    rows_data = []
    
    # Analyze if we need to filter for Karnataka (due to size limits on Catalyst/SQLite)
    is_large = len(df) > 100
    has_state_col = False
    state_col_name = ""
    for col in df.columns:
        if "state" in col.lower() or "name" in col.lower():
            # Check if values contain state names
            sample = df[col].dropna().head(10).astype(str).str.upper()
            if any("KARNATAKA" in s or "INDIA" in s for s in sample):
                has_state_col = True
                state_col_name = col
                break
                
    print(f"    Total rows in sheet: {len(df)}. Filtering required: {is_large}", flush=True)
    
    for idx, row in df.iterrows():
        row_dict = row.to_dict()
        txt = format_row(row_dict)
        
        # Filtering heuristic
        if is_large:
            # Keep rows containing Karnataka or if it matches state column
            txt_upper = txt.upper()
            is_karnataka = "KARNATAKA" in txt_upper or "BENGALURU" in txt_upper or "BANGALORE" in txt_upper
            if not is_karnataka:
                continue
                
        # Limit rows per spreadsheet to 150 to keep DB compact and avoid rate-limiting
        if len(rows_data) >= 150:
            break
            
        rows_data.append((idx + 1, txt))
        
    if not rows_data:
        print("    No matching rows to ingest.", flush=True)
        return
        
    print(f"    Ingesting {len(rows_data)} matching rows...", flush=True)
    
    # Process in batches of 50 to avoid memory footprint issues
    batch_size = 50
    for i in range(0, len(rows_data), batch_size):
        batch = rows_data[i:i+batch_size]
        texts = [b[1] for b in batch]
        embeddings = get_embeddings(texts)
        
        for (row_num, chunk_txt), emb in zip(batch, embeddings):
            emb_json = json.dumps(emb)
            
            metadata = {
                "source_type": "excel" if file_name.endswith("xlsx") else "csv",
                "source_file": file_name,
                "sheet_name": sheet_name,
                "row_number": row_num,
                "chunk_text": chunk_txt
            }
            metadata_str = json.dumps(metadata)
            
            db_client.execute(
                """
                INSERT INTO rag_document_embeddings (chunk_id, document_name, page_number, text_content, metadata_json, embedding)
                VALUES (:chunk_id, :doc_name, :page_num, :text_content, :metadata_json, :embedding);
                """,
                {
                    "chunk_id": next_chunk_id,
                    "doc_name": file_name,
                    "page_num": row_num,
                    "text_content": chunk_txt,
                    "metadata_json": metadata_str,
                    "embedding": emb_json
                }
            )
            next_chunk_id += 1
            
    print(f"    Ingested {len(rows_data)} rows successfully.", flush=True)

if __name__ == "__main__":
    ingest_spreadsheets()
