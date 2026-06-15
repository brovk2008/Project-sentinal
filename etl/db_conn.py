import os
import io
import logging
from sqlalchemy import create_engine
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

logger = logging.getLogger("sentinel_etl")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(handler)

def get_engine():
    """Returns a SQLAlchemy engine."""
    return create_engine(DB_URL)

def get_connection():
    """Returns a raw psycopg2 connection."""
    return psycopg2.connect(DB_URL)

def bulk_load_df(df, table_name, columns=None):
    """
    Performs high-speed bulk loading using PostgreSQL COPY command.
    Explicitly specifies the column list to handle tables with SERIAL
    primary keys or defaulted columns.

    NULL handling contract
    ─────────────────────
    • All null-like values (NaN, pd.NA, None) are written as empty strings in CSV.
    • PostgreSQL COPY with CSV format reads unquoted empty strings as NULL.
    • This preserves actual integers without converting them to floats/decimals,
      and loads strings, floats, and dates correctly.
    """
    import csv

    if df.empty:
        logger.info(f"DataFrame for table {table_name} is empty. Skipping load.")
        return

    # Use df columns if no columns specified
    if columns is None:
        columns = df.columns.tolist()

    # Filter df to only requested columns
    df_load = df[columns].copy()

    # Clean string columns: remove tabs and newlines which break TSV format,
    # and map null-sentinel strings to true None so they are written as empty fields.
    NULL_SENTINELS = {'nan', 'NaN', 'None', 'none', '<NA>', 'NULL', 'null'}
    for col in df_load.select_dtypes(include=['object']).columns:
        # Avoid double-cleaning if it's already string or category
        df_load[col] = (
            df_load[col]
            .astype(str)
            .str.replace('\t', ' ', regex=False)
            .str.replace('\n', ' ', regex=False)
            .str.replace('\r', ' ', regex=False)
        )
        # Convert null-like string values to None (to be output as empty fields in CSV)
        df_load[col] = df_load[col].apply(
            lambda v: None if v in NULL_SENTINELS else v
        )

    # Save dataframe to an in-memory CSV string buffer
    # In CSV format, we use standard double quoting and no escape character.
    # Null values are written as empty strings.
    buffer = io.StringIO()
    df_load.to_csv(buffer, index=False, header=False, sep='\t', na_rep='', quoting=csv.QUOTE_MINIMAL)
    buffer.seek(0)
    
    conn = get_connection()
    cursor = conn.cursor()
    
    col_str = f"({', '.join(columns)})"
    # In CSV mode, PostgreSQL defaults to unquoted empty strings as NULL.
    copy_sql = f"COPY {table_name} {col_str} FROM STDIN DELIMITER '\t' CSV"
    
    try:
        cursor.copy_expert(copy_sql, buffer)
        conn.commit()
        logger.info(f"Successfully bulk loaded {len(df_load)} rows into {table_name}.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Bulk load failed for table {table_name}: {e}")
        raise e
    finally:
        cursor.close()
        conn.close()
