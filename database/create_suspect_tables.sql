-- SQL commands to create suspect tables for Repeat Offender Intelligence

CREATE TABLE IF NOT EXISTS dim_suspects (
    suspect_id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    age INT,
    gender VARCHAR(10),
    primary_mo VARCHAR(150),
    recidivism_risk VARCHAR(20) DEFAULT 'LOW' -- 'HIGH', 'MEDIUM', 'LOW'
);

CREATE TABLE IF NOT EXISTS rel_fir_suspects (
    fir_id VARCHAR(100) REFERENCES fact_fir_events(fir_id) ON DELETE CASCADE,
    suspect_id INT REFERENCES dim_suspects(suspect_id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'Accused',
    PRIMARY KEY (fir_id, suspect_id)
);

-- Indexing for speed
CREATE INDEX IF NOT EXISTS idx_rel_fir_suspects_suspect ON rel_fir_suspects(suspect_id);
CREATE INDEX IF NOT EXISTS idx_rel_fir_suspects_fir ON rel_fir_suspects(fir_id);
