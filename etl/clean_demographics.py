import os
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from db_conn import bulk_load_df, get_connection

LOGGER = logging.getLogger("sentinel_etl")

DATA_DIR = Path(__file__).resolve().parents[1]

# Static SHRUG district ID mapping for Karnataka (State 29)
SHRUG_DISTRICT_MAP = {
    555: "Belgaum",
    556: "Bagalkot",
    557: "Bijapur",
    558: "Bidar",
    559: "Raichur",
    560: "Koppal",
    561: "Gadag",
    562: "Dharwad",
    563: "Uttara Kannada",
    564: "Haveri",
    565: "Bellary",
    566: "Chitradurga",
    567: "Davanagere",
    568: "Shimoga",
    569: "Udupi",
    570: "Chikmagalur",
    571: "Tumkur",
    572: "Bangalore",
    573: "Mandya",
    574: "Hassan",
    575: "Dakshina Kannada",
    576: "Kodagu",
    577: "Mysore",
    578: "Chamarajanagar",
    579: "Gulbarga",
    580: "Yadgir",
    581: "Kolar",
    582: "Chikkaballapura",
    583: "Bangalore Rural",
    584: "Ramanagara",
}

# ── Schema type map for dim_demographics (mirrors schema.sql) ─────────────────
# Columns that are INTEGER in PostgreSQL must arrive as pandas Int64 (nullable).
# Columns that are DECIMAL/FLOAT must arrive as float64 (NaN → NULL via \\N).
SCHEMA_INT_COLS   = {"population_total", "population_urban"}
SCHEMA_FLOAT_COLS = {"literacy_rate", "consumption_index", "facebook_wealth_index"}


def _coerce_null_sentinels(series: pd.Series) -> pd.Series:
    """Replace any string null-sentinel (\\N, nan, None, empty) with pd.NA."""
    NULL_STRINGS = {"\\N", "\\\\N", "nan", "NaN", "None", "none", "NULL", "null", ""}
    if series.dtype == object:
        series = series.replace(NULL_STRINGS, pd.NA)
    return series


def _coerce_int_col(df: pd.DataFrame, col: str) -> pd.DataFrame:
    """
    Safely cast a column to pandas nullable integer (Int64).
    Any value that cannot be parsed as an integer becomes pd.NA (→ NULL in COPY).
    """
    if col not in df.columns:
        df[col] = pd.NA
    series = _coerce_null_sentinels(df[col])
    df[col] = pd.to_numeric(series, errors="coerce").astype("Int64")
    return df


def _coerce_float_col(df: pd.DataFrame, col: str) -> pd.DataFrame:
    """
    Safely cast a column to float64.
    Any value that cannot be parsed becomes NaN (→ NULL via na_rep='\\N' in COPY).
    """
    if col not in df.columns:
        df[col] = np.nan
    series = _coerce_null_sentinels(df[col])
    df[col] = pd.to_numeric(series, errors="coerce").astype("float64")
    return df


def _validate_before_load(df: pd.DataFrame, table: str) -> None:
    """
    Print a pre-load audit table (column / dtype / null-count).
    Raises ValueError if any numeric column still contains non-numeric strings.
    """
    LOGGER.info(f"\n{'='*60}")
    LOGGER.info(f"PRE-LOAD VALIDATION  →  table: {table}  rows: {len(df)}")
    LOGGER.info(f"{'─'*60}")
    LOGGER.info(f"{'Column':<30} {'dtype':<12} {'nulls':>6}")
    LOGGER.info(f"{'─'*60}")
    for col in df.columns:
        null_count = df[col].isna().sum()
        LOGGER.info(f"{col:<30} {str(df[col].dtype):<12} {null_count:>6}")
    LOGGER.info(f"{'='*60}\n")

    # Guard: fail early if numeric columns contain non-numeric strings
    bad_cols = []
    for col in SCHEMA_INT_COLS | SCHEMA_FLOAT_COLS:
        if col not in df.columns:
            continue
        if df[col].dtype == object:
            bad_cols.append(
                f"  {col!r}: dtype=object — convert to numeric before COPY"
            )
    if bad_cols:
        msg = (
            f"PRE-LOAD CHECK FAILED for {table}.\n"
            "The following numeric columns are still object dtype and will "
            "cause PostgreSQL COPY to reject them:\n"
            + "\n".join(bad_cols)
        )
        LOGGER.error(msg)
        raise ValueError(msg)


def clean_and_load_demographics():
    LOGGER.info("Starting Demographic ETL Pipeline...")

    # Define file paths
    pca_file  = DATA_DIR / "pc11_pca_clean_pc11dist.csv"
    lit_file  = DATA_DIR / "india-literacy-data-district-wise" / "Literacy Data 2011.csv"
    fb_file   = DATA_DIR / "shrug-facebook-rwi-csv" / "facebook_rwi_pc11dist.csv"
    secc_file = DATA_DIR / "shrug-secc-cons-rural-csv" / "secc_cons_rural_pc11dist.csv"

    # ── Base frame ────────────────────────────────────────────────────────────
    records = [
        {"pc11_district_id": dist_id, "district_name": name,
         "geo_id": f"DISTRICT_{name.upper()}"}
        for dist_id, name in SHRUG_DISTRICT_MAP.items()
    ]
    df_master = pd.DataFrame(records)

    # ── 1. Census PCA (population_total → INTEGER) ───────────────────────────
    if pca_file.exists():
        LOGGER.info(f"Loading population data from {pca_file.name}")
        df_pca = pd.read_csv(pca_file)
        df_pca = df_pca[df_pca["pc11_state_id"] == 29]
        df_pca = (
            df_pca[["pc11_district_id", "pc11_pca_tot_p"]]
            .rename(columns={"pc11_pca_tot_p": "population_total"})
        )
        df_pca["pc11_district_id"] = df_pca["pc11_district_id"].astype(int)
        df_master = df_master.merge(df_pca, on="pc11_district_id", how="left")
    else:
        LOGGER.warning("Census PCA file missing! population_total will be NULL.")
        df_master["population_total"] = pd.NA

    # ── 2. Facebook RWI (facebook_wealth_index → FLOAT) ─────────────────────
    if fb_file.exists():
        LOGGER.info(f"Loading Facebook RWI data from {fb_file.name}")
        df_fb = pd.read_csv(fb_file)
        df_fb = df_fb[df_fb["pc11_state_id"] == 29]
        df_fb = (
            df_fb[["pc11_district_id", "facebook_mean_rwi"]]
            .rename(columns={"facebook_mean_rwi": "facebook_wealth_index"})
        )
        df_fb["pc11_district_id"] = df_fb["pc11_district_id"].astype(int)
        df_master = df_master.merge(df_fb, on="pc11_district_id", how="left")
    else:
        LOGGER.warning("Facebook RWI file missing! facebook_wealth_index will be NULL.")
        df_master["facebook_wealth_index"] = np.nan

    # ── 3. SECC Consumption (consumption_index → FLOAT) ─────────────────────
    if secc_file.exists():
        LOGGER.info(f"Loading SECC consumption data from {secc_file.name}")
        df_secc = pd.read_csv(secc_file)
        df_secc = df_secc[df_secc["pc11_state_id"] == 29]
        df_secc = (
            df_secc[["pc11_district_id", "secc_cons_rural"]]
            .rename(columns={"secc_cons_rural": "consumption_index"})
        )
        df_secc["pc11_district_id"] = df_secc["pc11_district_id"].astype(int)
        df_master = df_master.merge(df_secc, on="pc11_district_id", how="left")
    else:
        LOGGER.warning("SECC Consumption file missing! consumption_index will be NULL.")
        df_master["consumption_index"] = np.nan

    # ── 4. Literacy Data (literacy_rate → DECIMAL/FLOAT) ────────────────────
    if lit_file.exists():
        LOGGER.info(f"Loading literacy rates from {lit_file.name}")
        df_lit = pd.read_csv(lit_file)
        df_lit["State"]    = df_lit["State"].astype(str).str.strip().str.lower()
        df_lit["District"] = df_lit["District"].astype(str).str.strip()
        df_lit = df_lit[df_lit["State"] == "karnataka"]
        df_lit = df_lit[["District", "Literacy"]].rename(
            columns={"District": "district_name", "Literacy": "literacy_rate"}
        )

        spelling_map = {
            "Chamrajnagar":    "Chamarajanagar",
            "Chikkaballapura": "Chikkaballapura",
            "Chikmagalur":     "Chikmagalur",
            "Tumkur":          "Tumkur",
            "Shimoga":         "Shimoga",
            "Bijapur":         "Bijapur",
        }
        df_lit["district_name"] = df_lit["district_name"].replace(spelling_map)
        df_master = df_master.merge(df_lit, on="district_name", how="left")
    else:
        LOGGER.warning("Literacy CSV file missing! literacy_rate will be NULL.")
        df_master["literacy_rate"] = np.nan

    # ── population_urban: not available — stays NULL (INTEGER nullable) ───────
    # FIX: assign pd.NA (not Python None) so the column gets Int64 dtype,
    # not object dtype — Python None in an object column serialises as ""
    # in to_csv() and PostgreSQL COPY rejects "" for an INT column.
    df_master["population_urban"] = pd.NA  # ← was: None (caused the crash)

    # ── Select and coerce all final columns ──────────────────────────────────
    final_cols = [
        "geo_id",
        "population_total",
        "population_urban",
        "literacy_rate",
        "consumption_index",
        "facebook_wealth_index",
    ]
    df_demographics = df_master[final_cols].copy()

    # INTEGER columns → pandas nullable Int64 (NA serialises as \\N via COPY)
    for col in SCHEMA_INT_COLS:
        df_demographics = _coerce_int_col(df_demographics, col)

    # FLOAT columns → float64 (NaN serialises as \\N via na_rep='\\N')
    for col in SCHEMA_FLOAT_COLS:
        df_demographics = _coerce_float_col(df_demographics, col)

    # ── Pre-load validation ───────────────────────────────────────────────────
    _validate_before_load(df_demographics, "dim_demographics")

    # ── Bulk load ─────────────────────────────────────────────────────────────
    LOGGER.info("Clearing old demographics...")
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("TRUNCATE dim_demographics CASCADE;")
        conn.commit()
    except Exception as e:
        conn.rollback()
        LOGGER.error(f"Failed to truncate dim_demographics: {e}")
        raise e
    finally:
        cursor.close()
        conn.close()

    LOGGER.info("Loading demographics into database...")
    bulk_load_df(df_demographics, "dim_demographics", columns=final_cols)
    LOGGER.info("Demographics ETL complete.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    clean_and_load_demographics()
