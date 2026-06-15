import logging
import sys
from pathlib import Path

# Setup logging first
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("etl_run.log", encoding="utf-8")
    ]
)
LOGGER = logging.getLogger("sentinel_etl")

DATA_DIR = Path(__file__).resolve().parents[1]

# Configuration: all dataset paths
CONFIG = {
    "fir_csv": str(DATA_DIR / "fir-details-karnataka-police" / "FIR_Details_Data.csv"),
    "geodata_shp": str(DATA_DIR / "india-geodata" / "data" / "administrative" / "districts" / "census-2011" / "2011_Dist.shp"),
}


def run_step(name: str, fn, *args, **kwargs):
    LOGGER.info(f"\n{'='*60}")
    LOGGER.info(f"RUNNING STEP: {name}")
    LOGGER.info(f"{'='*60}")
    try:
        fn(*args, **kwargs)
        LOGGER.info(f"STEP COMPLETE: {name}")
    except Exception as e:
        LOGGER.error(f"STEP FAILED: {name} -> {e}")
        raise


def main():
    LOGGER.info("======================================")
    LOGGER.info("  PROJECT SENTINEL - PHASE 1 ETL RUN")
    LOGGER.info("======================================")

    # ----------------------------------------------------------------
    # EXECUTION ORDER (topological - dimensions before facts)
    # ----------------------------------------------------------------

    # Step 1: Generate district centroids and populate dim_geography
    from generate_district_centroids import generate_centroids
    run_step("1. District Centroids & Geography", generate_centroids, CONFIG["geodata_shp"])

    # Step 2: Load demographic enrichment data
    from clean_demographics import clean_and_load_demographics
    run_step("2. Demographics (Population, Literacy, Wealth, Consumption)", clean_and_load_demographics)

    # Step 3: FIR pipeline
    # This internally populates:
    #   - dim_police_units (from KML + FIR unique units)
    #   - dim_crime_classification (from FIR unique crime groups/heads)
    #   - fact_fir_events (fact records with coordinate fallback)
    from clean_fir import load_fir
    run_step("3. FIR Dataset (dims + facts)", load_fir, CONFIG["fir_csv"])

    # Step 4: Fraud pipeline
    # This internally populates:
    #   - dim_financial_accounts (unique sender/receiver)
    #   - fact_financial_transactions (fraud + PaySim)
    from clean_fraud import load_fraud
    run_step("4. Financial Fraud + PaySim (accounts + transactions)", load_fraud)

    # Step 5: CDR pipeline
    from clean_cdr import load_cdr
    run_step("5. Call Detail Records", load_cdr)

    LOGGER.info("\n======================================")
    LOGGER.info("  PHASE 1 ETL COMPLETED SUCCESSFULLY")
    LOGGER.info("======================================")


if __name__ == "__main__":
    main()
