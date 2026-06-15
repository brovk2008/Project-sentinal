-- Enable PostGIS for spatial queries and geometry processing
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable pgvector for semantic search in RAG
CREATE EXTENSION IF NOT EXISTS vector;

--------------------------------------------------------
-- DIMENSION TABLES
--------------------------------------------------------

-- 1. Date Dimension
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

-- 2. District Centroids Table (for FIR coordinate fallbacks)
CREATE TABLE district_centroids (
    district_name VARCHAR(100) PRIMARY KEY,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL
);

-- 3. Police Units Dimension (Stations)
CREATE TABLE dim_police_units (
    unit_id INT PRIMARY KEY,
    unit_name VARCHAR(150) NOT NULL,
    district_name VARCHAR(100) NOT NULL,
    circle_name VARCHAR(100),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6)
);

-- 4. Geography Dimension (Admin Boundaries & Coordinates)
CREATE TABLE dim_geography (
    geo_id VARCHAR(100) PRIMARY KEY, -- Composite key like 'DISTRICT_NAME' or 'DISTRICT_UNIT_BEAT'
    district_name VARCHAR(100) NOT NULL,
    sub_district_name VARCHAR(100),
    beat_name VARCHAR(100),
    village_area_name VARCHAR(150),
    geom GEOMETRY(Geometry, 4326) -- PostGIS geometry (supports points or polygons)
);

-- 5. Demographics Dimension
CREATE TABLE dim_demographics (
    geo_id VARCHAR(100) PRIMARY KEY REFERENCES dim_geography(geo_id) ON DELETE CASCADE,
    population_total INT,
    population_urban INT,
    literacy_rate DECIMAL(5,2),
    consumption_index DECIMAL(15,4),
    facebook_wealth_index DECIMAL(15,6)
);

-- 6. Crime Classification Dimension
CREATE TABLE dim_crime_classification (
    crime_class_id SERIAL PRIMARY KEY,
    crime_group_name VARCHAR(150) NOT NULL,
    crime_head_name VARCHAR(150) NOT NULL,
    UNIQUE(crime_group_name, crime_head_name)
);

-- 7. Vehicles Dimension
CREATE TABLE dim_vehicles (
    registration_number VARCHAR(20) PRIMARY KEY,
    owner_name VARCHAR(150),
    maker_name VARCHAR(100),
    vehicle_category_name VARCHAR(50),
    vehicle_model_name VARCHAR(100),
    fuel_name VARCHAR(50),
    vehicle_class_name VARCHAR(100),
    registration_year INT
);

-- 8. Financial Accounts Dimension
CREATE TABLE dim_financial_accounts (
    account_number VARCHAR(50) PRIMARY KEY,
    owner_name VARCHAR(150),
    bank_name VARCHAR(100),
    risk_score DECIMAL(3,2) DEFAULT 0.0 -- Computed risk score of mule or fraud activity
);

--------------------------------------------------------
-- FACT TABLES
--------------------------------------------------------

-- 9. FIR Details Fact Table (Primary Crime Log)
CREATE TABLE fact_fir_events (
    fir_id VARCHAR(100) PRIMARY KEY, -- Composite: District + Unit + Year + FIR No
    fir_number VARCHAR(50) NOT NULL,
    unit_id INT NOT NULL REFERENCES dim_police_units(unit_id),
    geo_id VARCHAR(100) REFERENCES dim_geography(geo_id),
    crime_class_id INT NOT NULL REFERENCES dim_crime_classification(crime_class_id),
    fir_date TIMESTAMP NOT NULL,
    offence_duration_minutes INT DEFAULT 0,
    fir_type VARCHAR(50),
    fir_stage VARCHAR(100),
    complaint_mode VARCHAR(100),
    io_name VARCHAR(150),
    io_kgid VARCHAR(30),
    victim_count INT DEFAULT 0,
    accused_count INT DEFAULT 0,
    arrested_count INT DEFAULT 0,
    conviction_count INT DEFAULT 0,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    geom GEOMETRY(Point, 4326) -- PostGIS Point geometry for mapping
);

-- 10. Financial Transactions Fact Table (PaySim + Fraud Transaction Datasets)
CREATE TABLE fact_financial_transactions (
    transaction_id VARCHAR(50) PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    sender_account VARCHAR(50) NOT NULL REFERENCES dim_financial_accounts(account_number),
    receiver_account VARCHAR(50) NOT NULL REFERENCES dim_financial_accounts(account_number),
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

-- 11. Call Detail Records Fact Table (CDR Data)
CREATE TABLE fact_call_detail_records (
    cdr_id SERIAL PRIMARY KEY,
    caller_number VARCHAR(20) NOT NULL,
    receiver_number VARCHAR(20) NOT NULL,
    caller_company VARCHAR(50),
    receiver_company VARCHAR(50),
    call_timestamp TIMESTAMP NOT NULL,
    duration_seconds INT NOT NULL,
    cell_tower_id VARCHAR(50)
);

-- 12. Document Chunk Embeddings (For RAG)
CREATE TABLE rag_document_embeddings (
    chunk_id SERIAL PRIMARY KEY,
    document_name VARCHAR(255) NOT NULL,
    page_number INT,
    text_content TEXT NOT NULL,
    metadata_json JSONB,
    embedding vector(1536) -- Default dimension size for OpenAI/BGE models
);

--------------------------------------------------------
-- DATA WAREHOUSE INDEXES
--------------------------------------------------------

-- Spatial Indexes (PostGIS GIST)
CREATE INDEX idx_fir_geom ON fact_fir_events USING GIST(geom);
CREATE INDEX idx_geography_geom ON dim_geography USING GIST(geom);

-- Temporal Indexes
CREATE INDEX idx_fir_date ON fact_fir_events(fir_date);
CREATE INDEX idx_tx_timestamp ON fact_financial_transactions(timestamp);
CREATE INDEX idx_cdr_timestamp ON fact_call_detail_records(call_timestamp);

-- Transactional Link Query Indexes (Network Link Optimization)
CREATE INDEX idx_tx_sender ON fact_financial_transactions(sender_account);
CREATE INDEX idx_tx_receiver ON fact_financial_transactions(receiver_account);
CREATE INDEX idx_cdr_caller ON fact_call_detail_records(caller_number);
CREATE INDEX idx_cdr_receiver ON fact_call_detail_records(receiver_number);

-- Metadata Filter Index for RAG
CREATE INDEX idx_rag_metadata ON rag_document_embeddings USING GIN(metadata_json);

--------------------------------------------------------
-- TRIGGERS & PROCEDURES
--------------------------------------------------------

-- Auto-populate geom from latitude and longitude on INSERT/UPDATE
CREATE OR REPLACE FUNCTION update_fir_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_Point(NEW.longitude, NEW.latitude), 4326);
    ELSE
        NEW.geom := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fir_geom
BEFORE INSERT OR UPDATE ON fact_fir_events
FOR EACH ROW
EXECUTE FUNCTION update_fir_geom();

--------------------------------------------------------
-- PRE-POPULATION OF CALENDAR DIMENSION
--------------------------------------------------------

INSERT INTO dim_date (date_key, calendar_date, year, month, month_name, day_of_month, day_of_week, day_name, quarter, is_weekend)
SELECT
    to_char(d, 'YYYYMMDD')::INT AS date_key,
    d::DATE AS calendar_date,
    EXTRACT(YEAR FROM d)::INT AS year,
    EXTRACT(MONTH FROM d)::INT AS month,
    to_char(d, 'Month') AS month_name,
    EXTRACT(DAY FROM d)::INT AS day_of_month,
    EXTRACT(ISODOW FROM d)::INT AS day_of_week,
    to_char(d, 'Day') AS day_name,
    EXTRACT(QUARTER FROM d)::INT AS quarter,
    CASE WHEN EXTRACT(ISODOW FROM d) IN (6, 7) THEN TRUE ELSE FALSE END AS is_weekend
FROM generate_series('2010-01-01'::TIMESTAMP, '2026-12-31'::TIMESTAMP, '1 day'::INTERVAL) d
ON CONFLICT (date_key) DO NOTHING;
