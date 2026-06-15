# 05 — Datasets

This document provides a comprehensive catalogue of the 15+ datasets integrated into Project Sentinel. The data flows from raw files into our Zoho Catalyst Data Store and in-memory NumPy vector cache.

## Dataset Inventory Summary

| Dataset Category | Source File(s) | Primary Use | Record Count | File Format |
|---|---|---|---|---|
| **Crime Record** | `fir-details-karnataka-police/FIR_Details_Data.csv` | Historical crimes and arrest facts | 1,674,734 | CSV (546 MB) |
| **Financial Fraud** | `financial-transactions-dataset-for-fraud-detection/financial_fraud_detection_dataset.csv` | Fraud transaction facts | 5,000,000 | CSV (759 MB) |
| **Financial PaySim**| `paysim1/PS_20174392719_1491204439457_log.csv` | Base bank account network facts | 6,362,620 | CSV (470 MB) |
| **Telecom Records** | `CDR-Generator/results/` | Communications analysis facts | 33,876 | CSV (1.8 MB) |
| **GIS Boundaries** | `india-geodata/data/.../2011_Dist.shp` | Boundary geometries (WKT) | 36 districts | SHP (GIS) |
| **Demographics** | `indian-census-2011-dataset/` | Population demographics dimension | 640 districts | CSV |
| **Literacy** | `india-literacy-data-district-wise/Literacy Data 2011.csv` | Regional literacy dimension | 640 districts | CSV |
| **Facebook Wealth**| `shrug-facebook-rwi-csv/facebook_rwi_pc11dist.csv` | Relative wealth indicator (RWI) | 640 districts | CSV |
| **Consumption** | `shrug-secc-cons-rural-csv/secc_cons_rural_pc11dist.csv` | Household economic index | 615 districts | CSV |
| **Nightlights** | `shrug-viirs-annual-csv/viirs_annual_pc11dist.csv` | Economic development index | 15,360 rows | CSV |
| **Bank Directory** | `SHRUG RBI/SHRUG RBI/data/rbi_directory_shrid.csv` | Regional banking density dimension | 154,505 | CSV |
| **Vector Corpus** | 13 Crime PDFs (ACID Attack, Organized Crime, NCRB) | RAG Knowledge Vault chunks | 2,384 chunks | PDF |

---

## In-Depth Profile of Core Datasets

### 1. Karnataka Police FIR Details
- **Description**: Official record of First Information Reports (FIRs) filed in Karnataka.
- **Attributes**: 34 columns including district, station unit, offense type, date/time, investigating officer (IO) name, legal acts/sections, and arrest counts.
- **Missing Value Handling**: Coordinates (latitude/longitude) are missing on 68.24% of entries. During ETL, missing coordinates are mapped to **District Centroids** computed from Census Shapefiles to prevent rendering failure on dashboards.

### 2. Financial Fraud & PaySim Logs
- **Description**: Synthesized wire transfers, deposits, and cash withdrawals containing confirmed fraud flags.
- **Attributes**: Transaction ID, sender/receiver accounts, bank names, amount, transaction type, location, device hash, velocity risk score, and geographical anomaly score.
- **Scale**: Over **11.3 Million total transactions** representing a complex network of accounts.

### 3. Call Detail Records (CDR)
- **Description**: Telecom call records representing caller and receiver interactions, call durations, timestamps, and tower IDs.
- **Primary Use**: Mapped dynamically onto financial fraud networks to discover co-offender coordinates.

### 4. Vector Knowledge PDFs
- **Description**: Handbooks, police specials, and official reports.
- **Corpus**:
  - `CrimeinIndia2024-VolumeI1.pdf` (Volume I, II, III NCRB official statistics reports)
  - `Organised crime.pdf`
  - `Terrorism.pdf`
  - `ACID ATTACK.pdf`
  - `Human Trafficking.pdf`
  - `Technology.pdf` (Cybercrime manuals)
- **Ingestion Limit**: Ingested first **50 pages** of NCRB documents to ensure standard vector search times.

## Related Notes
- [[03_Database_Schema]]
- [[04_ETL_Pipeline]]
- [[06_AI_Models]]
- [[09_RAG_System]]
