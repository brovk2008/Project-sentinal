import psycopg2
import os

SUPABASE_URL = os.getenv("DATABASE_URL")
if not SUPABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")
EXPORT_DIR = "supabase_export"

TABLES = [
    "dim_vehicles", "spatial_ref_sys", "dim_date", "district_centroids",
    "dim_geography", "dim_police_units", "dim_crime_classification",
    "dim_financial_accounts", "fact_financial_transactions",
    "fact_call_detail_records", "dim_demographics", "fact_fir_events",
    "rag_document_embeddings"
]

def import_all():
    if not os.path.exists(EXPORT_DIR):
        print(f"Export directory {EXPORT_DIR} not found.")
        return
        
    try:
        conn = psycopg2.connect(SUPABASE_URL)
        cur = conn.cursor()
    except Exception as e:
        print("Failed to connect to Supabase:", e)
        return

    print("Starting import to Supabase...")
    for table in TABLES:
        input_file = os.path.join(EXPORT_DIR, f"{table}.csv")
        if not os.path.exists(input_file):
            print(f"File {input_file} not found, skipping...")
            continue
            
        print(f"Importing {table} from {input_file}...")
        
        # We use COPY for high performance ingestion
        try:
            if table != "spatial_ref_sys":
                cur.execute(f"DELETE FROM {table};")
            with open(input_file, 'rb') as f:
                cur.copy_expert(f"COPY {table} FROM STDIN WITH CSV HEADER", f)
            conn.commit()
            print(f"Successfully imported {table}.")
        except Exception as e:
            print(f"Error importing {table}: {e}")
            conn.rollback()
            
    cur.close()
    conn.close()
    print("Import complete.")

if __name__ == "__main__":
    import_all()
