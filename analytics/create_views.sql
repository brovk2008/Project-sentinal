-- Materialized views to optimize Project Sentinel analytical dashboard queries.
-- These precompute aggregates over millions of rows to ensure <100ms API response times.

-- 1. District Profile Stats
DROP MATERIALIZED VIEW IF EXISTS mv_district_profile CASCADE;
CREATE MATERIALIZED VIEW mv_district_profile AS
SELECT
    pu.district_name,
    COUNT(*) AS total_firs,
    COUNT(DISTINCT f.unit_id) AS station_count,
    COUNT(DISTINCT f.crime_class_id) AS unique_crime_types,
    SUM(f.victim_count) AS total_victims,
    SUM(f.accused_count) AS total_accused,
    SUM(f.arrested_count) AS total_arrested,
    MIN(f.fir_date)::DATE AS earliest_fir,
    MAX(f.fir_date)::DATE AS latest_fir
FROM fact_fir_events f
JOIN dim_police_units pu ON f.unit_id = pu.unit_id
GROUP BY pu.district_name;

CREATE UNIQUE INDEX idx_mv_district_profile_name ON mv_district_profile(district_name);

-- 2. Monthly and Yearly Trends by District and Crime Group
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_trends CASCADE;
CREATE MATERIALIZED VIEW mv_monthly_trends AS
SELECT
    DATE_TRUNC('month', f.fir_date)::DATE AS month,
    pu.district_name,
    cc.crime_group_name,
    COUNT(*) AS fir_count,
    SUM(f.victim_count) AS total_victims,
    SUM(f.accused_count) AS total_accused,
    SUM(f.arrested_count) AS total_arrested,
    SUM(f.conviction_count) AS total_convicted
FROM fact_fir_events f
JOIN dim_police_units pu ON f.unit_id = pu.unit_id
JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id
GROUP BY month, pu.district_name, cc.crime_group_name;

CREATE UNIQUE INDEX idx_mv_monthly_trends_uq ON mv_monthly_trends(month, district_name, crime_group_name);
CREATE INDEX idx_mv_monthly_trends_lookup ON mv_monthly_trends(district_name, crime_group_name);

-- 3. Top Stations within each District
DROP MATERIALIZED VIEW IF EXISTS mv_station_profile CASCADE;
CREATE MATERIALIZED VIEW mv_station_profile AS
SELECT
    pu.unit_id,
    pu.unit_name AS station_name,
    pu.district_name,
    pu.latitude,
    pu.longitude,
    COUNT(*) AS fir_count,
    SUM(f.victim_count) AS victims,
    SUM(f.accused_count) AS accused,
    SUM(f.arrested_count) AS arrests,
    SUM(f.conviction_count) AS convictions,
    MODE() WITHIN GROUP (ORDER BY cc.crime_group_name) AS top_crime_group
FROM fact_fir_events f
JOIN dim_police_units pu ON f.unit_id = pu.unit_id
JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id
GROUP BY pu.unit_id, pu.unit_name, pu.district_name, pu.latitude, pu.longitude;

CREATE UNIQUE INDEX idx_mv_station_profile_uq ON mv_station_profile(unit_id);
CREATE INDEX idx_mv_station_profile_lookup ON mv_station_profile(district_name, fir_count DESC);

-- 4. District-Level Aggregate Choropleth (Total, Violent, Financial per Year/Crime Group)
DROP MATERIALIZED VIEW IF EXISTS mv_district_choropleth CASCADE;
CREATE MATERIALIZED VIEW mv_district_choropleth AS
SELECT
    pu.district_name,
    cc.crime_group_name,
    EXTRACT(YEAR FROM f.fir_date)::INT AS year,
    COUNT(*) AS crime_count,
    COUNT(*) FILTER (WHERE cc.crime_group_name ILIKE '%murder%' OR cc.crime_group_name ILIKE '%rape%' OR cc.crime_group_name ILIKE '%assault%' OR cc.crime_group_name ILIKE '%kidnap%') AS violent_count,
    COUNT(*) FILTER (WHERE cc.crime_group_name ILIKE '%fraud%' OR cc.crime_group_name ILIKE '%cheat%' OR cc.crime_group_name ILIKE '%counterfeit%') AS financial_count
FROM fact_fir_events f
JOIN dim_police_units pu ON f.unit_id = pu.unit_id
JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id
GROUP BY pu.district_name, cc.crime_group_name, year;

CREATE INDEX idx_mv_district_choro_lookup ON mv_district_choropleth(district_name, crime_group_name, year);

-- 5. 1km² Spatial Grid Density (0.02 degree grid cells)
DROP MATERIALIZED VIEW IF EXISTS mv_grid_density CASCADE;
CREATE MATERIALIZED VIEW mv_grid_density AS
SELECT
    ROUND(ST_Y(f.geom)::NUMERIC, 2) AS lat_bucket,
    ROUND(ST_X(f.geom)::NUMERIC, 2) AS lon_bucket,
    EXTRACT(YEAR FROM f.fir_date)::INT AS year,
    cc.crime_group_name,
    COUNT(*) AS intensity
FROM fact_fir_events f
JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id
WHERE f.geom IS NOT NULL
GROUP BY lat_bucket, lon_bucket, year, cc.crime_group_name;

CREATE INDEX idx_mv_grid_density_lookup ON mv_grid_density(crime_group_name, year);
CREATE INDEX idx_mv_grid_density_buckets ON mv_grid_density(lat_bucket, lon_bucket);

-- 6. Top Crime Heads (Detailed Breakdown)
DROP MATERIALIZED VIEW IF EXISTS mv_top_crimes CASCADE;
CREATE MATERIALIZED VIEW mv_top_crimes AS
SELECT
    EXTRACT(YEAR FROM f.fir_date)::INT AS year,
    pu.district_name,
    cc.crime_group_name,
    cc.crime_head_name,
    COUNT(*) AS fir_count,
    SUM(f.victim_count) AS victims,
    SUM(f.accused_count) AS accused,
    SUM(f.arrested_count) AS arrests,
    SUM(f.conviction_count) AS convictions
FROM fact_fir_events f
JOIN dim_police_units pu ON f.unit_id = pu.unit_id
JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id
GROUP BY year, pu.district_name, cc.crime_group_name, cc.crime_head_name;

CREATE INDEX idx_mv_top_crimes_lookup ON mv_top_crimes(year, district_name, crime_group_name);

-- 7. Day of Week Patterns
DROP MATERIALIZED VIEW IF EXISTS mv_day_of_week_trends CASCADE;
CREATE MATERIALIZED VIEW mv_day_of_week_trends AS
SELECT
    EXTRACT(DOW FROM f.fir_date)::INT AS day_of_week,
    pu.district_name,
    cc.crime_group_name,
    COUNT(*) AS crime_count,
    SUM(f.victim_count) AS total_victims
FROM fact_fir_events f
JOIN dim_police_units pu ON f.unit_id = pu.unit_id
JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id
GROUP BY day_of_week, pu.district_name, cc.crime_group_name;

CREATE INDEX idx_mv_dow_lookup ON mv_day_of_week_trends(district_name, crime_group_name);

-- 8. Raw Crime Points (Latitude, Longitude)
DROP MATERIALIZED VIEW IF EXISTS mv_crime_points CASCADE;
CREATE MATERIALIZED VIEW mv_crime_points AS
SELECT
    ST_Y(f.geom) AS latitude,
    ST_X(f.geom) AS longitude,
    cc.crime_group_name,
    cc.crime_head_name,
    f.fir_date::DATE AS fir_date,
    f.fir_type,
    pu.district_name
FROM fact_fir_events f
JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id
JOIN dim_police_units pu ON f.unit_id = pu.unit_id
WHERE f.geom IS NOT NULL;

CREATE INDEX idx_mv_crime_points_group ON mv_crime_points(crime_group_name);
CREATE INDEX idx_mv_crime_points_date ON mv_crime_points(fir_date);
CREATE INDEX idx_mv_crime_points_district ON mv_crime_points(district_name);

-- 9. Financial Network Scan Candidates
DROP MATERIALIZED VIEW IF EXISTS mv_network_scan_candidates CASCADE;
CREATE MATERIALIZED VIEW mv_network_scan_candidates AS
SELECT
    sender_account AS account_number,
    SUM(amount)::float AS total_amount,
    AVG(amount)::float AS avg_amount,
    MAX(amount)::float AS max_amount,
    COUNT(*)::float AS tx_count,
    COALESCE(AVG(velocity_score), 0.0)::float AS velocity_mean,
    COALESCE(AVG(geo_anomaly_score), 0.0)::float AS geo_anomaly_mean
FROM fact_financial_transactions
GROUP BY sender_account
ORDER BY velocity_mean DESC, total_amount DESC
LIMIT 1000;

CREATE UNIQUE INDEX idx_mv_network_scan_candidates_uq ON mv_network_scan_candidates(account_number);

-- 10. Missing indexes on fact_financial_transactions
CREATE INDEX IF NOT EXISTS idx_tx_velocity_score ON fact_financial_transactions(velocity_score);
CREATE INDEX IF NOT EXISTS idx_tx_geo_anomaly_score ON fact_financial_transactions(geo_anomaly_score);
CREATE INDEX IF NOT EXISTS idx_tx_is_fraud ON fact_financial_transactions(is_fraud) WHERE (is_fraud = true);
CREATE INDEX IF NOT EXISTS idx_tx_sender ON fact_financial_transactions(sender_account);
CREATE INDEX IF NOT EXISTS idx_tx_receiver ON fact_financial_transactions(receiver_account);

-- 11. Network Stats View
DROP MATERIALIZED VIEW IF EXISTS mv_network_stats CASCADE;
CREATE MATERIALIZED VIEW mv_network_stats AS
SELECT
    (SELECT COUNT(*)::bigint FROM fact_financial_transactions WHERE is_fraud = TRUE) AS total_fraud_transactions,
    (SELECT COALESCE(SUM(amount), 0.0)::double precision FROM fact_financial_transactions WHERE is_fraud = TRUE) AS total_fraud_amount,
    (SELECT COUNT(*)::bigint FROM fact_call_detail_records) AS total_cdr_records,
    (SELECT COUNT(DISTINCT caller_number)::bigint FROM fact_call_detail_records) AS unique_callers,
    (SELECT COUNT(*)::bigint FROM dim_financial_accounts WHERE risk_score > 0.7) AS high_risk_accounts;

CREATE UNIQUE INDEX idx_mv_network_stats_uq ON mv_network_stats(total_fraud_transactions);

-- 12. Fraud Graph Edges View
DROP MATERIALIZED VIEW IF EXISTS mv_fraud_graph_edges CASCADE;
CREATE MATERIALIZED VIEW mv_fraud_graph_edges AS
SELECT
    t.sender_account AS source,
    t.receiver_account AS target,
    COUNT(*) AS transaction_count,
    SUM(t.amount) AS total_amount,
    fa_s.risk_score AS sender_risk,
    fa_r.risk_score AS receiver_risk,
    fa_s.owner_name AS sender_name,
    fa_r.owner_name AS receiver_name,
    fa_s.bank_name AS sender_bank,
    fa_r.bank_name AS receiver_bank
FROM fact_financial_transactions t
JOIN dim_financial_accounts fa_s ON t.sender_account = fa_s.account_number
JOIN dim_financial_accounts fa_r ON t.receiver_account = fa_r.account_number
WHERE t.is_fraud = TRUE
GROUP BY t.sender_account, t.receiver_account, fa_s.risk_score, fa_r.risk_score, 
         fa_s.owner_name, fa_r.owner_name, fa_s.bank_name, fa_r.bank_name;

CREATE UNIQUE INDEX idx_mv_fraud_graph_edges_uq ON mv_fraud_graph_edges(source, target);

-- 13. Financial Anomalies View
DROP MATERIALIZED VIEW IF EXISTS mv_anomaly_financial CASCADE;
CREATE MATERIALIZED VIEW mv_anomaly_financial AS
SELECT
    transaction_id,
    timestamp,
    sender_account,
    receiver_account,
    amount,
    transaction_type,
    is_fraud,
    COALESCE(velocity_score,    0) AS velocity_score,
    COALESCE(geo_anomaly_score, 0) AS geo_anomaly_score,
    (COALESCE(velocity_score, 0) + COALESCE(geo_anomaly_score, 0)) AS combined_score
FROM fact_financial_transactions
WHERE velocity_score > 3 OR geo_anomaly_score > 0.7
ORDER BY combined_score DESC
LIMIT 500;

CREATE UNIQUE INDEX idx_mv_anomaly_financial_uq ON mv_anomaly_financial(transaction_id);



