import os
import logging
from pathlib import Path
import pandas as pd
from tqdm import tqdm
from datetime import datetime, timedelta
from db_conn import bulk_load_df, get_connection

LOGGER = logging.getLogger("sentinel_etl")
DATA_DIR = Path(__file__).resolve().parents[1]

FRAUD_FILE = DATA_DIR / "financial-transactions-dataset-for-fraud-detection" / "financial_fraud_detection_dataset.csv"
PAYSIM_FILE = DATA_DIR / "paysim1" / "PS_20174392719_1491204439457_log.csv"
PAYSIM_EPOCH = datetime(2024, 1, 1)

CHUNK_SIZE = 200_000


def register_accounts(accounts: set):
    """
    Bulk-upsert unique accounts into dim_financial_accounts.

    Strategy: COPY into a temp staging table, then INSERT … ON CONFLICT DO NOTHING
    in a single SQL statement.  ~900k accounts register in < 2 s instead of 15+ min.
    """
    import io, csv as csv_mod
    if not accounts:
        return

    # Build clean account list (deduplicated, truncated)
    clean = list({str(a).strip()[:49] for a in accounts if a and str(a).strip()})
    if not clean:
        return

    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Temp table is session-scoped and dropped automatically on commit (ON COMMIT DROP)
        cursor.execute(
            "CREATE TEMP TABLE _staging_accounts (account_number VARCHAR(50)) ON COMMIT DROP;"
        )

        # Bulk-load via COPY (CSV mode, single column, no header)
        buf = io.StringIO()
        writer = csv_mod.writer(buf)
        for acc in clean:
            writer.writerow([acc])
        buf.seek(0)
        cursor.copy_expert(
            "COPY _staging_accounts (account_number) FROM STDIN CSV", buf
        )

        # Single-statement upsert from staging into the real table
        cursor.execute(
            """
            INSERT INTO dim_financial_accounts (account_number)
            SELECT account_number FROM _staging_accounts
            ON CONFLICT (account_number) DO NOTHING;
            """
        )
        conn.commit()
        LOGGER.info(f"Registered {len(clean)} financial accounts (bulk COPY).")
    except Exception as e:
        conn.rollback()
        LOGGER.error(f"Account registration failed: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


def load_financial_fraud():
    """Load the financial_fraud_detection_dataset.csv into fact_financial_transactions."""
    if not FRAUD_FILE.exists():
        LOGGER.error(f"Fraud file not found: {FRAUD_FILE}")
        return
    LOGGER.info("=== Loading Financial Fraud Dataset ===")

    # Pass 1: collect all unique accounts
    LOGGER.info("Pass 1: collecting unique accounts...")
    all_accounts = set()
    for chunk in tqdm(pd.read_csv(FRAUD_FILE, chunksize=CHUNK_SIZE, dtype=str, low_memory=False), desc="Scanning accounts"):
        chunk.columns = chunk.columns.str.strip()
        if "sender_account" in chunk.columns:
            all_accounts.update(chunk["sender_account"].dropna().unique())
        if "receiver_account" in chunk.columns:
            all_accounts.update(chunk["receiver_account"].dropna().unique())
    register_accounts(all_accounts)

    # Pass 2: load facts
    LOGGER.info("Pass 2: loading fraud transactions...")
    FACT_COLS = [
        "transaction_id", "timestamp", "sender_account", "receiver_account",
        "amount", "transaction_type", "merchant_category", "location",
        "device_used", "is_fraud", "fraud_type", "velocity_score", "geo_anomaly_score"
    ]
    total = 0
    for chunk in tqdm(pd.read_csv(FRAUD_FILE, chunksize=CHUNK_SIZE, dtype=str, low_memory=False), desc="Fraud facts"):
        chunk.columns = chunk.columns.str.strip()
        # Parse timestamp
        chunk["timestamp"] = pd.to_datetime(chunk.get("timestamp", ""), errors="coerce")
        chunk["timestamp"] = chunk["timestamp"].fillna(pd.Timestamp("2024-01-01"))
        # Parse amount
        chunk["amount"] = pd.to_numeric(chunk.get("amount", 0), errors="coerce").fillna(0.0)
        # Parse bool fraud flag → PostgreSQL CSV boolean must be 't'/'f'
        chunk["is_fraud"] = chunk.get("is_fraud", "false").astype(str).str.lower().map(
            {"true": "t", "1": "t", "false": "f", "0": "f"}).fillna("f")
        # Fill missing fraud_type
        chunk["fraud_type"] = chunk.get("fraud_type", pd.Series("NONE", index=chunk.index)).fillna("NONE").astype(str).str[:49]
        # Coerce scores
        chunk["velocity_score"] = pd.to_numeric(chunk.get("velocity_score", 0), errors="coerce").fillna(0.0)
        chunk["geo_anomaly_score"] = pd.to_numeric(chunk.get("geo_anomaly_score", 0), errors="coerce").fillna(0.0)
        # Truncate strings
        for col in ["transaction_id","transaction_type","merchant_category","location","device_used","fraud_type"]:
            if col in chunk.columns:
                chunk[col] = chunk[col].astype(str).str.strip().str[:49]
        load_df = chunk[[c for c in FACT_COLS if c in chunk.columns]].copy()
        bulk_load_df(load_df, "fact_financial_transactions", columns=[c for c in FACT_COLS if c in load_df.columns])
        total += len(load_df)
    LOGGER.info(f"Fraud dataset loaded: {total} rows.")


def load_paysim():
    """Load PaySim transactions into fact_financial_transactions."""
    if not PAYSIM_FILE.exists():
        LOGGER.error(f"PaySim file not found: {PAYSIM_FILE}")
        return
    LOGGER.info("=== Loading PaySim Dataset ===")

    # Pass 1: collect accounts
    LOGGER.info("Pass 1: collecting unique PaySim accounts...")
    all_accounts = set()
    for chunk in tqdm(pd.read_csv(PAYSIM_FILE, chunksize=CHUNK_SIZE, dtype=str, low_memory=False), desc="Scanning PaySim accounts"):
        chunk.columns = chunk.columns.str.strip()
        for col in ["nameOrig", "nameDest"]:
            if col in chunk.columns:
                all_accounts.update(chunk[col].dropna().unique())
    register_accounts(all_accounts)

    # Pass 2: load facts
    LOGGER.info("Pass 2: loading PaySim transactions...")
    tx_counter = 0
    total = 0
    for chunk in tqdm(pd.read_csv(PAYSIM_FILE, chunksize=CHUNK_SIZE, dtype=str, low_memory=False), desc="PaySim facts"):
        chunk.columns = chunk.columns.str.strip()
        # Convert step (hours from epoch) to timestamp using vectorized operations
        chunk["step"] = pd.to_numeric(chunk.get("step", 0), errors="coerce").fillna(0).astype(int)
        chunk["timestamp"] = PAYSIM_EPOCH + pd.to_timedelta(chunk["step"], unit="h")
        # Assign synthetic transaction_id using range index format
        chunk["transaction_id"] = "PS_" + pd.RangeIndex(tx_counter, tx_counter + len(chunk)).astype(str)
        tx_counter += len(chunk)
        # Map columns
        chunk["sender_account"] = chunk.get("nameOrig", "").astype(str).str[:49]
        chunk["receiver_account"] = chunk.get("nameDest", "").astype(str).str[:49]
        chunk["amount"] = pd.to_numeric(chunk.get("amount", 0), errors="coerce").fillna(0.0)
        chunk["transaction_type"] = chunk.get("type", "").astype(str).str.strip().str[:29]
        # is_fraud → PostgreSQL CSV boolean 't'/'f'
        chunk["is_fraud"] = chunk.get("isFraud", "0").astype(str).map({"1": "t", "0": "f"}).fillna("f")
        chunk["fraud_type"] = chunk["is_fraud"].map({"t": "PAYSIM_FRAUD", "f": "NONE"}).fillna("NONE")
        chunk["merchant_category"] = "N/A"
        chunk["location"] = "N/A"
        chunk["device_used"] = "N/A"
        chunk["velocity_score"] = 0.0
        chunk["geo_anomaly_score"] = 0.0
        chunk["transaction_id"] = chunk["transaction_id"].astype(str).str[:49]
        fact_cols = ["transaction_id","timestamp","sender_account","receiver_account",
            "amount","transaction_type","merchant_category","location","device_used",
            "is_fraud","fraud_type","velocity_score","geo_anomaly_score"]
        load_df = chunk[fact_cols].copy()
        bulk_load_df(load_df, "fact_financial_transactions", columns=fact_cols)
        total += len(load_df)
    LOGGER.info(f"PaySim loaded: {total} rows.")


def load_fraud():
    """Run both fraud dataset loaders."""
    LOGGER.info("Clearing old financial accounts and transactions...")
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("TRUNCATE dim_financial_accounts CASCADE;")
        conn.commit()
    except Exception as e:
        conn.rollback()
        LOGGER.error(f"Failed to truncate financial tables: {e}")
        raise e
    finally:
        cursor.close()
        conn.close()

    load_financial_fraud()
    load_paysim()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    load_fraud()
