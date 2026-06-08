# Project Sentinel: Hackathon Implementation & Execution Roadmap

This document serves as the operational roadmap, database schema specification, and MVP definition for Project Sentinel, optimized for execution during the Karnataka State Police Hackathon.

---

## PART 1: Project Modules in Build Order

The project modules are structured sequentially to establish a solid database and data cleaning foundation before building the analytics, AI forecasting, RAG knowledge retriever, and final presentation layers.

```
Phase 1: Environment & PostgreSQL Setup
   └── Phase 2: ETL Pipeline & Data Ingestion
        └── Phase 3: Spatial-Temporal Core Analytics
             └── Phase 4: AI Predictors & RAG Core
                  └── Phase 5: FastAPI Service Layer
                       └── Phase 6: System Integration & Demo Prep
```

### Phase Summary
1.  **Phase 1: Environment & PostgreSQL Setup**: Configure database, install extensions (PostGIS), and create base tables.
2.  **Phase 2: ETL Pipeline & Data Ingestion**: Clean, map, and import all 10 datasets into the database.
3.  **Phase 3: Spatial-Temporal Core Analytics**: Implement hotspot detection, network analysis queries, and financial transaction profiling.
4.  **Phase 4: AI Predictors & RAG Core**: Construct the PDF knowledge index, vector search, and baseline crime forecasting engines.
5.  **Phase 5: FastAPI Service Layer**: Build endpoints to deliver analytics, RAG answers, and forecasts to the frontend.
6.  **Phase 6: System Integration & Demo Prep**: End-to-end dry runs, mock scenario runs, and dashboard response optimization.

---

## PART 2: Phase Breakdown

### Phase 1: Environment & PostgreSQL Setup
*   **Goal**: Establish a unified, high-performance database instance capable of handling spatial and transactional queries.
*   **Inputs**: Empty database, PostgreSQL schema script (`schema.sql`).
*   **Outputs**: Operational local/containerized PostgreSQL database with PostGIS enabled and table schemas initialized.
*   **Dependencies**: Local PostgreSQL installation or Docker.
*   **Estimated Complexity**: Low (1-2 hours).

### Phase 2: ETL Pipeline & Data Ingestion
*   **Goal**: Standardize and populate PostgreSQL with the historical FIR, demographic, geographic, vehicle, CDR, and financial datasets.
*   **Inputs**: Raw CSVs, KML boundary maps, Excel documents.
*   **Outputs**: Populated database tables containing deduplicated, cleaned, and spatially resolved records.
*   **Dependencies**: Phase 1, Python (pandas, SQLAlchemy, psycopg2, geopandas).
*   **Estimated Complexity**: High (12-16 hours - due to large size of FIR and transaction datasets).

### Phase 3: Spatial-Temporal Core Analytics
*   **Goal**: Compute spatial-temporal density aggregates, identify network links, and identify financial crime patterns.
*   **Inputs**: Cleaned SQL tables.
*   **Outputs**: Database materialized views, network adjacency matrices, and analytical reports.
*   **Dependencies**: Phase 2, NetworkX (Python) / pgRouting / SQL Graph queries.
*   **Estimated Complexity**: Medium (6-8 hours).

### Phase 4: AI Predictors & RAG Core
*   **Goal**: Implement layout-aware PDF document retrieval and baseline machine learning crime forecasting.
*   **Inputs**: NCRB & specialized PDFs, historical crime spatial aggregation tables.
*   **Outputs**: Vector store index (pgvector), hybrid search engine, and a regression/time-series forecasting engine.
*   **Dependencies**: Phase 2, LlamaIndex/LangChain, sentence-transformers, scikit-learn.
*   **Estimated Complexity**: High (8-10 hours).

### Phase 5: FastAPI Service Layer
*   **Goal**: Expose spatial data, RAG search, network graphs, and predictive forecasting results via standard API endpoints.
*   **Inputs**: Python services, database queries, models.
*   **Outputs**: Swagger/OpenAPI documentation, JSON response APIs.
*   **Dependencies**: Phase 3, Phase 4, FastAPI.
*   **Estimated Complexity**: Medium (4-6 hours).

### Phase 6: System Integration & Demo Prep
*   **Goal**: Wire the APIs, seed mock simulation stories (e.g., tracking a specific proclaimed offender), and verify frontend compatibility.
*   **Inputs**: Working backend APIs, mock scenario profiles.
*   **Outputs**: Fully functional integrated prototype backend responding to test calls in <500ms.
*   **Dependencies**: Phase 5.
*   **Estimated Complexity**: Medium (4-5 hours).

---

## PART 3: PostgreSQL Schema Specification

To build the database, execute the following SQL instructions. Tables are organized by foreign-key dependency order (dimensions and lookups first, relationship bridges, then facts).

### 3.1 Database Initialization Sequence
```sql
-- Step 1: Enable PostGIS for Spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Step 2: Enable pgvector for semantic RAG search
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3.2 Table Schema Creation (CREATE TABLE order)

```sql
-- 1. dim_date
CREATE TABLE dim_date (
    date_key INT PRIMARY KEY, -- YYYYMMDD
    calendar_date DATE NOT NULL UNIQUE,
    year INT NOT NULL,
    month INT NOT NULL,
    month_name VARCHAR(15) NOT NULL,
    day_of_month INT NOT NULL,
    day_of_week INT NOT NULL,
    day_name VARCHAR(15) NOT NULL,
    quarter INT NOT NULL,
    is_weekend BOOLEAN NOT NULL
);

-- 2. dim_police_units
CREATE TABLE dim_police_units (
    unit_id INT PRIMARY KEY,
    unit_name VARCHAR(150) NOT NULL UNIQUE,
    district_name VARCHAR(100) NOT NULL,
    circle_name VARCHAR(100),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6)
);

-- 3. dim_geography
CREATE TABLE dim_geography (
    geo_id VARCHAR(50) PRIMARY KEY, -- e.g., 'KAR_BLR_001' or Village Code
    district_name VARCHAR(100) NOT NULL,
    sub_district_name VARCHAR(100),
    beat_name VARCHAR(100),
    village_area_name VARCHAR(150),
    geom GEOMETRY(Geometry, 4326)
);

-- 4. dim_demographics
CREATE TABLE dim_demographics (
    geo_id VARCHAR(50) PRIMARY KEY REFERENCES dim_geography(geo_id) ON DELETE CASCADE,
    population_total INT,
    population_urban INT,
    literacy_rate DECIMAL(5,2),
    consumption_index DECIMAL(5,2),
    facebook_wealth_index DECIMAL(5,4)
);

-- 5. dim_crime_classification
CREATE TABLE dim_crime_classification (
    crime_class_id SERIAL PRIMARY KEY,
    crime_group_name VARCHAR(150) NOT NULL,
    crime_head_name VARCHAR(150) NOT NULL,
    UNIQUE(crime_group_name, crime_head_name)
);

-- 6. dim_citizens
CREATE TABLE dim_citizens (
    citizen_id VARCHAR(64) PRIMARY KEY, -- SHA256 Hash of identity details
    full_name VARCHAR(150) NOT NULL,
    gender VARCHAR(15),
    age INT
);

-- 7. dim_vehicles
CREATE TABLE dim_vehicles (
    registration_number VARCHAR(20) PRIMARY KEY,
    owner_citizen_id VARCHAR(64) REFERENCES dim_citizens(citizen_id) ON DELETE SET NULL,
    vehicle_make VARCHAR(50),
    vehicle_model VARCHAR(100),
    vehicle_category VARCHAR(50),
    registration_date DATE
);

-- 8. dim_financial_accounts
CREATE TABLE dim_financial_accounts (
    account_number VARCHAR(30) PRIMARY KEY,
    owner_citizen_id VARCHAR(64) REFERENCES dim_citizens(citizen_id) ON DELETE SET NULL,
    bank_name VARCHAR(100),
    risk_score DECIMAL(3,2) DEFAULT 0.0
);

-- 9. fact_fir_events
CREATE TABLE fact_fir_events (
    fir_id VARCHAR(50) PRIMARY KEY, -- Composite: District + Unit + Year + FIR No
    fir_number VARCHAR(30) NOT NULL,
    unit_id INT NOT NULL REFERENCES dim_police_units(unit_id),
    geo_id VARCHAR(50) REFERENCES dim_geography(geo_id),
    crime_class_id INT NOT NULL REFERENCES dim_crime_classification(crime_class_id),
    fir_date TIMESTAMP NOT NULL,
    offence_start_time TIMESTAMP,
    offence_end_time TIMESTAMP,
    fir_type VARCHAR(50),
    fir_stage VARCHAR(100),
    complaint_mode VARCHAR(100),
    io_name VARCHAR(150),
    io_kgid VARCHAR(20),
    victim_count INT DEFAULT 0,
    accused_count INT DEFAULT 0,
    arrested_count INT DEFAULT 0,
    conviction_count INT DEFAULT 0,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    geom GEOMETRY(Point, 4326)
);

-- 10. fact_financial_transactions
CREATE TABLE fact_financial_transactions (
    transaction_id VARCHAR(50) PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    sender_account VARCHAR(30) NOT NULL REFERENCES dim_financial_accounts(account_number),
    receiver_account VARCHAR(30) NOT NULL REFERENCES dim_financial_accounts(account_number),
    amount DECIMAL(15,2) NOT NULL,
    transaction_type VARCHAR(30),
    merchant_category VARCHAR(50),
    location VARCHAR(100),
    device_used VARCHAR(50),
    is_fraud BOOLEAN DEFAULT FALSE,
    fraud_type VARCHAR(50),
    velocity_score DECIMAL(5,2),
    geo_anomaly_score DECIMAL(5,2)
);

-- 11. fact_call_detail_records
CREATE TABLE fact_call_detail_records (
    cdr_id SERIAL PRIMARY KEY,
    caller_number VARCHAR(20) NOT NULL,
    receiver_number VARCHAR(20) NOT NULL,
    call_timestamp TIMESTAMP NOT NULL,
    duration_seconds INT NOT NULL,
    cell_tower_id VARCHAR(50)
);

-- 12. rel_fir_citizens (Many-to-Many Bridge)
CREATE TABLE rel_fir_citizens (
    fir_id VARCHAR(50) REFERENCES fact_fir_events(fir_id) ON DELETE CASCADE,
    citizen_id VARCHAR(64) REFERENCES dim_citizens(citizen_id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- 'Accused', 'Victim', 'Complainant', 'Witness'
    is_arrested BOOLEAN DEFAULT FALSE,
    is_chargesheeted BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (fir_id, citizen_id, role)
);

-- 13. rag_document_embeddings
CREATE TABLE rag_document_embeddings (
    chunk_id SERIAL PRIMARY KEY,
    document_name VARCHAR(255) NOT NULL,
    page_number INT,
    text_content TEXT NOT NULL,
    metadata_json JSONB,
    embedding vector(1536) -- BGE-M3 or OpenAI 1536 size
);
```

### 3.3 Core Database Indexes (Optimized for Querying)
```sql
-- Spatial Queries Indexing
CREATE INDEX idx_fir_geom ON fact_fir_events USING GIST(geom);
CREATE INDEX idx_geo_geom ON dim_geography USING GIST(geom);

-- Temporal Queries Indexing
CREATE INDEX idx_fir_date ON fact_fir_events(fir_date);
CREATE INDEX idx_tx_timestamp ON fact_financial_transactions(timestamp);
CREATE INDEX idx_cdr_timestamp ON fact_call_detail_records(call_timestamp);

-- Lookup & Link Indexing
CREATE INDEX idx_rel_citizen ON rel_fir_citizens(citizen_id);
CREATE INDEX idx_tx_sender ON fact_financial_transactions(sender_account);
CREATE INDEX idx_tx_receiver ON fact_financial_transactions(receiver_account);
CREATE INDEX idx_cdr_numbers ON fact_call_detail_records(caller_number, receiver_number);
```

---

## PART 4: ETL Implementation Plan

A Python script using `pandas` and `SQLAlchemy` is the simplest, most performant way to load data inside the hackathon window.

### 4.1 FIR Details Ingestion
*   **File Location**: `fir-details-karnataka-police\FIR_Details_Data.csv`
*   **Expected Columns**: `District_Name`, `UnitName`, `FIR_YEAR`, `FIR_MONTH`, `FIR_Day`, `Offence_Duration`, `FIR Type`, `FIR_Stage`, `Complaint_Mode`, `CrimeGroup_Name`, `CrimeHead_Name`, `Latitude`, `Longitude`, `ActSection`, `IOName`, `KGID`, `VICTIM COUNT`, `Accused Count`, `Arrested Count`, `Accused_ChargeSheeted Count`, `Conviction Count`, `Unit_ID`
*   **Cleaning Rules**:
    1.  *Date Assembly*: Concatenate `FIR_YEAR`, `FIR_MONTH`, `FIR_Day` into `YYYY-MM-DD 00:00:00`. Use pandas `to_datetime` with error coercion.
    2.  *Spatial Imputation*: If `Latitude` or `Longitude` is null or zero, query `dim_geography` for the matching `Village_Area_Name` or `Beat_Name` center point. If still missing, fallback to the centroid of the `UnitName` (Police Station) boundary.
    3.  *String Strip*: Strip white space and convert to title-case for `District_Name`, `UnitName`, and `CrimeGroup_Name`.
*   **Validation Rules**:
    *   Verify Latitudes are strictly between `11.0` and `19.0`, and Longitudes are between `74.0` and `79.0`. Drop coordinates outside this Karnataka bounding box and replace them with station centroids.
*   **Destination Table**: `fact_fir_events`, `dim_police_units` (inserted via lookup lookup-or-create), `dim_crime_classification` (lookup-or-create).

### 4.2 Financial Fraud Ingestion (PaySim & Transactions)
*   **File Location**: 
    1. `financial-transactions-dataset-for-fraud-detection\financial_fraud_detection_dataset.csv`
    2. `paysim1\PS_20174392719_1491204439457_log.csv`
*   **Expected Columns**:
    1. *Transactions*: `transaction_id`, `timestamp`, `sender_account`, `receiver_account`, `amount`, `transaction_type`, `merchant_category`, `location`, `is_fraud`, `velocity_score`, `geo_anomaly_score`
    2. *PaySim*: `step`, `type`, `amount`, `nameOrig`, `oldbalanceOrg`, `newbalanceOrig`, `nameDest`, `oldbalanceDest`, `newbalanceDest`, `isFraud`
*   **Cleaning Rules**:
    1.  *PaySim Time mapping*: Parse `step` (which represents hours elapsed) into an absolute timestamp starting from `2024-01-01 00:00:00` (i.e. `2024-01-01 + step * '1 hour'::interval`).
    2.  *Account Registration*: Build unique lists of accounts from `sender_account`, `receiver_account`, `nameOrig`, and `nameDest`. Create corresponding entries in `dim_financial_accounts` first before inserting transactions.
*   **Validation Rules**:
    *   `amount` must be greater than 0.
*   **Destination Table**: `dim_financial_accounts`, `fact_financial_transactions`.

### 4.3 Demographic & Literacy Ingestion
*   **File Location**:
    1. `india-literacy-data-district-wise\Literacy Data 2011.csv`
    2. `PCA_India.csv` / Shrug population datasets.
*   **Expected Columns**: `District`, `State`, `Literacy`
*   **Cleaning Rules**:
    1.  Lower and strip names of districts. Map `"Bangalore"` or `"Bangalore Urban"`/`"Bangalore Rural"` to `"BENGALURU"` to match FIR dataset naming conventions.
    2.  Filter entries strictly matching `State = 'Karnataka'`.
*   **Validation Rules**:
    *   `Literacy` must be a decimal value between 0.0 and 100.0.
*   **Destination Table**: `dim_demographics`, `dim_geography`.

### 4.4 Call Detail Records Ingestion
*   **File Location**: `CDR-Generator\results\cdr_data.csv`
*   **Expected Columns**: `Caller id`, `Caller company`, `Receiver id`, `Receiver company`, `Timestamp`, `Duration s.`
*   **Cleaning Rules**:
    1.  Parse `Timestamp` as format `YYYY-MM-DD HH:MM`.
    2.  Generate synthetic 10-digit phone numbers from numeric IDs to simulate realistic cellular CDR traces.
*   **Validation Rules**:
    *   Verify `Duration s.` is non-negative.
*   **Destination Table**: `fact_call_detail_records`.

---

## PART 5: Post-MVP Postponements & Simpler Alternatives

To deliver a working dashboard within the hackathon limits, we defer advanced components and deploy lightweight, high-performance replacements.

| Advanced Component (Architecture Blueprint) | MVP Delay Action | Practical Hackathon Alternative |
| :--- | :--- | :--- |
| **Neo4j Graph Database** | Delay | Use **PostgreSQL CTE recursive queries** or Python's **NetworkX** to generate community sub-graphs on the fly. This avoids the overhead of managing, syncing, and querying a second database engine. |
| **GNN Spatio-Temporal Forecasting** | Delay | Use a **LightGBM / Random Forest Regressor** or a classical time-series models (e.g. **Prophet** / historical spatial averages). Group historical crimes by `(district, crime_group, week_of_year)` and predict values based on lagging features. |
| **Graph Neural Network Embeddings** | Delay | Compute node degrees, shortest paths, and local clusters directly in PostgreSQL using SQL aggregation or Python network libraries. |
| **Apache Spark Distributed ETL** | Delay | Replace Spark with **Python `pandas` with chunking** (`chunksize` in `read_csv`) or PostgreSQL COPY commands. This runs directly in memory and loads data in minutes. |
| **Unstructured.io API parser** | Delay | Use **PyPDF2** or **pdfplumber** locally in a script to extract text and tables, avoiding external APIs and internet dependency. |

---

## PART 6: MVP Feature Scope

The MVP focuses on three main interactive pillars that provide maximum visual feedback to judges:

1.  **Crime Hotspot Density Map**:
    *   Interactive map showing the density of crimes in Karnataka (using Leaflet.js / Folium / Mapbox via GeoJSON output).
    *   Filterable by Crime Group (e.g. POCSO, Snatching, Financial Crime) and Date/Year range.
2.  **Suspect Network Link Analysis**:
    *   Visual representation of suspect relationships based on Call Detail Records and shared FIR cases (co-accused).
    *   Generates node-link diagrams displaying calling circles and suspect linkages.
3.  **Legal Assistant & RAG Query Interface**:
    *   Search bar where users ask questions about Karnataka police guidelines or IPC sections (e.g., *"What is the procedure for registering an Acid Attack case under IPC?"*).
    *   Returns the specific text paragraphs from the NCRB/Guideline PDFs alongside the generated response.

---

## PART 7: Hackathon Priority List

*   **P0 (Mandatory for Demo)**:
    *   PostgreSQL & PostGIS Database setup and table schemas.
    *   ETL script loading FIR, Demographics, and CDR datasets.
    *   Hotspot analysis endpoint (`/api/v1/analytics/hotspots`) returning GeoJSON coordinate grids.
    *   Simple RAG indexing pipeline and query endpoint (`/api/v1/rag/query`).
*   **P1 (Important for Depth)**:
    *   Network link analysis endpoint (`/api/v1/network/suspect/{id}`) returning suspect links.
    *   Financial transaction fraud analysis table ingestion and risk-scorer.
    *   Vehicle owner check lookup endpoint.
*   **P2 (Nice to Have)**:
    *   Time-series forecast endpoint (`/api/v1/prediction/forecast`) using Random Forest/Prophet.
    *   Explainable feature-attribution weights list (e.g., correlation of crime rate with literacy).
*   **P3 (Future Release)**:
    *   Neo4j integration and Graph Neural Networks.
    *   Real-time Kafka event streams.

---

## PART 8: Project Folder Structure

```
Project-Sentinel/
├── database/
│   ├── schema.sql              # SQL definitions (DDL) and indexing scripts
│   └── seed_mock.sql           # Fast mock dataset insertion script for tests
├── datasets/                   # Symlinked or local folders containing data
│   ├── fir-details/
│   ├── financial-fraud/
│   ├── cdr/
│   └── pdfs/
├── etl/
│   ├── __init__.py
│   ├── clean_fir.py            # Clean and load FIR CSV
│   ├── clean_fraud.py          # Clean and load PaySim and transaction CSV
│   ├── clean_cdr.py            # Clean and load CDR logs
│   └── run_etl.py              # Orchestrator script executing all loaders
├── analytics/
│   ├── __init__.py
│   ├── hotspot_engine.py       # Spatial KDE calculations
│   └── network_engine.py       # NetworkX algorithms mapping co-accused
├── rag/
│   ├── __init__.py
│   ├── parser.py               # Local pdfplumber parser
│   ├── embedder.py             # SentenceTransformers embedding generator
│   └── retriever.py            # Vector search query processor
├── backend/
│   ├── __init__.py
│   ├── main.py                 # FastAPI runner
│   ├── config.py               # Env settings
│   └── routes/
│       ├── hotspots.py         # Spatial maps router
│       ├── suspect_network.py  # Link graphs router
│       ├── forecasting.py      # Forecasting router
│       └── rag.py              # Q&A search router
├── scripts/
│   ├── test_endpoints.py       # Verification test script
│   └── run_system.ps1          # Master script starting db, run ETL, start FastAPI
└── README.md
```

---

## PART 9: Week 1 Development Plan

### Day 1: Schema & Environment Setup
*   **Deliverable**: PostgreSQL database online with PostGIS, tables created, and database health check verified.
*   **Milestone**: Schema script `database/schema.sql` runs without errors.

### Day 2: Core Data Ingestion (FIR & Geodata)
*   **Deliverable**: Python script parsing `FIR_Details_Data.csv` and loading 100k+ rows with clean coordinates into PostGIS.
*   **Milestone**: Database spatial query (`ST_Contains`) on Karnataka boundaries successfully identifies points.

### Day 3: Network & Financial Data Loader
*   **Deliverable**: Ingestion of financial transactions and CDR dataset.
*   **Milestone**: Adjacency list query identifies call connections between two test numbers.

### Day 4: Analytical Calculations (Hotspots & Networks)
*   **Deliverable**: Implementation of Spatial hotspot calculator and NetworkX link builder.
*   **Milestone**: Endpoint returns list of high-density crime hot-zones and suspect sub-graphs.

### Day 5: Knowledge RAG Indexing
*   **Deliverable**: pdfplumber script chunking NCRB/guideline PDFs, generating embeddings, and storing them in the PostgreSQL `rag_document_embeddings` table.
*   **Milestone**: Retrieval system answers legal queries with page-number references.

### Day 6: FastAPI Route Completion & Models
*   **Deliverable**: Integration of forecast baseline model and API endpoint routes.
*   **Milestone**: FastAPI swagger UI (`/docs`) fully active and answering requests.

### Day 7: End-to-End Testing & Demo Verification
*   **Deliverable**: Performance profiling, query caching with Redis, and mock story setup.
*   **Milestone**: Complete walkthrough run of the backend demo script.
