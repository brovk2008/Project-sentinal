import os
import logging
import hashlib
from pathlib import Path
import pandas as pd
from tqdm import tqdm
from db_conn import bulk_load_df, get_connection

LOGGER = logging.getLogger("sentinel_etl")
DATA_DIR = Path(__file__).resolve().parents[1]

CDR_FILES = [
    DATA_DIR / "CDR-Generator" / "results" / "cdr_data.csv",
    DATA_DIR / "CDR-Generator" / "results" / "cdr_situation1.csv",
]
TARGET_TABLE = "fact_call_detail_records"
CHUNK_SIZE = 50_000

FACT_COLS = [
    "caller_number", "receiver_number", "caller_company",
    "receiver_company", "call_timestamp", "duration_seconds", "cell_tower_id"
]


def generate_tower_id(caller: str, ts: str) -> str:
    """Synthesize a cell tower ID hash from caller + timestamp."""
    raw = f"{caller}_{ts}"
    return "TWR_" + hashlib.md5(raw.encode()).hexdigest()[:8].upper()


def load_cdr():
    LOGGER.info("=== Starting CDR ETL Pipeline ===")
    
    LOGGER.info("Clearing old CDR records...")
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("TRUNCATE fact_call_detail_records CASCADE;")
        conn.commit()
    except Exception as e:
        conn.rollback()
        LOGGER.error(f"Failed to truncate fact_call_detail_records: {e}")
        raise e
    finally:
        cursor.close()
        conn.close()

    total_loaded = 0

    for cdr_file in CDR_FILES:
        if not cdr_file.exists():
            LOGGER.warning(f"CDR file not found, skipping: {cdr_file}")
            continue
        LOGGER.info(f"Processing: {cdr_file.name}")

        for chunk in tqdm(
            pd.read_csv(cdr_file, chunksize=CHUNK_SIZE, dtype=str, low_memory=False),
            desc=f"CDR {cdr_file.name}"
        ):
            chunk.columns = chunk.columns.str.strip()

            # Map CDR columns to schema
            # Source: Caller id, Caller company, Receiver id, Receiver company, Timestamp, Duration s.
            chunk["caller_number"] = chunk.get("Caller id", pd.Series("", index=chunk.index)) \
                .astype(str).str.strip().str.zfill(10).str[:19]
            chunk["receiver_number"] = chunk.get("Receiver id", pd.Series("", index=chunk.index)) \
                .astype(str).str.strip().str.zfill(10).str[:19]
            chunk["caller_company"] = chunk.get("Caller company", pd.Series("", index=chunk.index)) \
                .astype(str).str.strip().str[:49]
            chunk["receiver_company"] = chunk.get("Receiver company", pd.Series("", index=chunk.index)) \
                .astype(str).str.strip().str[:49]

            # Parse timestamps
            chunk["call_timestamp"] = pd.to_datetime(
                chunk.get("Timestamp", pd.Series("", index=chunk.index)),
                errors="coerce"
            ).fillna(pd.Timestamp("2024-01-01"))

            # Duration in seconds
            chunk["duration_seconds"] = pd.to_numeric(
                chunk.get("Duration s.", 0), errors="coerce"
            ).fillna(0).astype(int)

            # Synthesize cell tower id
            chunk["cell_tower_id"] = chunk.apply(
                lambda r: generate_tower_id(r["caller_number"], str(r["call_timestamp"])),
                axis=1
            )

            load_df = chunk[FACT_COLS].copy()
            # cdr_id is SERIAL - do NOT include it in the load
            bulk_load_df(load_df, TARGET_TABLE, columns=FACT_COLS)
            total_loaded += len(load_df)

    LOGGER.info(f"CDR ETL complete. Total rows loaded: {total_loaded}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    load_cdr()
