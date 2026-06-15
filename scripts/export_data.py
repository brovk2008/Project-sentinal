import psycopg2
import os

import os
DB_URL = os.getenv("DATABASE_URL")
EXPORT_DIR = "supabase_export"

TABLES = [
    "dim_vehicles", "spatial_ref_sys", "dim_date", "district_centroids",
    "dim_geography", "dim_police_units", "dim_crime_classification",
    "dim_financial_accounts", "fact_financial_transactions",
    "fact_call_detail_records", "dim_demographics", "fact_fir_events",
    "rag_document_embeddings"
]

def export_all():
    os.makedirs(EXPORT_DIR, exist_ok=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    print("Starting export...")
    for table in TABLES:
        output_file = os.path.join(EXPORT_DIR, f"{table}.csv")
        print(f"Exporting {table} to {output_file}...")
        
        # We use COPY for high performance binary/CSV export
        with open(output_file, 'wb') as f:
            cur.copy_expert(f"COPY {table} TO STDOUT WITH CSV HEADER", f)
            
        print(f"Finished {table}.")
        
    cur.close()
    conn.close()
    print("Export complete.")

if __name__ == "__main__":
    export_all()
