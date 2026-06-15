# 04 — ETL Pipeline

This document explains the Data Ingestion and ETL (Extract, Transform, Load) Pipeline of Project Sentinel. The ETL processes raw files (CSV, Shapefiles, KML, and PDFs) and populates the database using a topological ordering to satisfy foreign key constraints.

## Ingestion Architecture

```mermaid
flowchart TD
    subgraph RawSources [Raw Sources]
        Shapefile[Census 2011 Shapefile]
        ShrugCSV[SHRUG Demographic CSVs]
        FirCSV[FIR Details CSV - 1.67M rows]
        FraudCSV[Financial Transactions CSV - 11.3M rows]
        CdrCSV[Call Detail Records CSV]
        SpecialPDFs[Special Police PDFs & NCRB Reports]
    end

    subgraph Scripts [ETL Scripts - etl/]
        Centroid[1. generate_district_centroids.py]
        Demo[2. clean_demographics.py]
        FIR[3. clean_fir.py]
        Fraud[4. clean_fraud.py]
        CDR[5. clean_cdr.py]
        IngestPDF[6. backend/rag/ingest.py]
    end

    subgraph DB [Zoho Catalyst Data Store]
        D_Centroid[(district_centroids)]
        D_Geo[(dim_geography)]
        D_Demo[(dim_demographics)]
        D_Unit[(dim_police_units)]
        D_Crime[(dim_crime_classification)]
        F_FIR[(fact_fir_events)]
        D_Acc[(dim_financial_accounts)]
        F_Tx[(fact_financial_transactions)]
        F_CDR[(fact_call_detail_records)]
        F_RAG[(rag_document_embeddings)]
    end

    Shapefile --> Centroid
    Centroid --> D_Centroid
    Centroid --> D_Geo
    
    ShrugCSV --> Demo
    D_Geo -.-> Demo
    Demo --> D_Demo
    
    FirCSV --> FIR
    D_Centroid -.-> FIR
    FIR --> D_Unit
    FIR --> D_Crime
    FIR --> F_FIR
    
    FraudCSV --> Fraud
    Fraud --> D_Acc
    Fraud --> F_Tx
    
    CdrCSV --> CDR
    CDR --> F_CDR
    
    SpecialPDFs --> IngestPDF
    IngestPDF --> F_RAG
```

---

## Ingestion Order & Details

The ETL is coordinated by [run_etl.py](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/etl/run_etl.py) and runs in the following sequence:

### Step 1: District Centroids & Geography
- **Script**: `generate_district_centroids.py`
- **Action**: Reads the Census 2011 GIS Shapefile for India, filters for Karnataka State districts, computes the geographic centroid (latitude/longitude) for each district, and writes them to the `district_centroids` table. It also populates the base geography boundaries in `dim_geography`.

### Step 2: Demographics Enrichment
- **Script**: `clean_demographics.py`
- **Action**: Loads and cleans SHRUG (Development Data Lab) census datasets, relative wealth indicators, and consumption indices. Links population and economic metrics directly to spatial geography records (`geo_id`) in the `dim_demographics` table.

### Step 3: FIR Dataset Ingestion
- **Script**: `clean_fir.py`
- **Action**: Processes **1.67 Million rows** from the Karnataka Police FIR dataset. 
  - Iterates through FIR entries.
  - Dynamically registers newly encountered police stations in `dim_police_units` and legal headings in `dim_crime_classification`.
  - Cleans and inserts records into `fact_fir_events`.
  - **Coordinate Fallback Rule**: If latitude/longitude is missing or zero for an FIR, the script queries the `district_centroids` table for the corresponding district and uses that centroid coordinate to prevent database corruption and map visual issues.

### Step 4: Financial Transactions
- **Script**: `clean_fraud.py`
- **Action**: Ingests **11.3 Million rows** of synthetic transaction records (PaySim + custom financial datasets).
  - Collects all unique accounts and inserts them into `dim_financial_accounts`.
  - Populates `fact_financial_transactions` with transactional volumes, transaction type, location, fraud labels, and computed velocity/geographic anomaly scores.

### Step 5: Call Detail Records
- **Script**: `clean_cdr.py`
- **Action**: Loads CDR datasets into `fact_call_detail_records` to provide linkage mappings for communication analysis.

### Step 6: RAG Document Ingestion
- **Script**: `backend/rag/ingest.py`
- **Action**: Processes 13 special crime PDFs (including 3 massive volumes of the 2024 Crime in India NCRB Report). 
  - Extracts text page-by-page.
  - Generates 384-dimensional embeddings using a local `all-MiniLM-L6-v2` transformer or falls back to the Hugging Face Inference API router.
  - Inserts the resulting text chunk, document source, page number, and vector embedding stringified JSON array into the `rag_document_embeddings` table.

---

## Log Output Example

Running the full pipeline produces a log file (`etl_run.log`) showing execution progress:

```text
2026-06-08 18:24:12,192 - INFO - ======================================
2026-06-08 18:24:12,192 - INFO -   PROJECT SENTINEL - PHASE 1 ETL RUN
2026-06-08 18:24:12,192 - INFO - ======================================
2026-06-08 18:24:12,195 - INFO - RUNNING STEP: 1. District Centroids & Geography
2026-06-08 18:24:15,310 - INFO - STEP COMPLETE: 1. District Centroids & Geography
...
2026-06-08 18:28:44,510 - INFO -   PHASE 1 ETL COMPLETED SUCCESSFULLY
```

## Related Notes
- [[03_Database_Schema]]
- [[05_Datasets]]
- [[09_RAG_System]]
- [[10_Deployment_Guide]]
