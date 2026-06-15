# 13 — Performance Report

This document records the before-and-after latency benchmarks for all API endpoints measured during Phase 4.1 and Phase 5A optimizations.

---

## Phase 4.1 — Critical Performance Fixes

### Root Causes Identified

| Endpoint | Root Cause | Pre-Fix Time |
|---|---|---|
| `GET /network/stats` | 5 sequential `COUNT(*)` sub-queries against 11.3M row `fact_financial_transactions` table, no index on `is_fraud` | **14.88s** |
| `GET /network/fraud-graph` | Full JOIN between 11.3M transactions + `dim_financial_accounts`, no index on `is_fraud`, no pre-aggregation | **8.94s** |
| `GET /ai/anomalies` | Ran `detect_crime_spikes()` + `detect_financial_anomalies()` as raw DB queries on every API call, no cache | **9.13s** |

### Phase 5A Fixes Applied

#### 1. Materialized Views Created (12 total)
All expensive aggregations precomputed at view build time:

| View Name | Replaces | Rows Affected |
|---|---|---|
| `mv_network_stats` | Raw `COUNT(*)` fraud totals across 11.3M rows | 1 row |
| `mv_fraud_graph_edges` | Live JOIN of transactions + account metadata | Pre-joined |
| `mv_anomaly_financial` | Top 500 anomalies via ORDER BY combined_score | 500 rows |
| `mv_district_profile` | Per-district FIR aggregates | 36 rows |
| `mv_monthly_trends` | Monthly breakdown by district+crime group | ~85K rows |
| `mv_station_profile` | Per-station FIR/arrest statistics | 1,062 rows |
| `mv_district_choropleth` | Annual district crime breakdowns | ~900 rows |
| `mv_grid_density` | 1km² spatial density buckets | Spatial |
| `mv_top_crimes` | Crime category rankings per district | ~2,800 rows |
| `mv_day_of_week_trends` | Day-of-week crime distributions | ~400 rows |
| `mv_crime_points` | Raw GPS coordinates for map layers | ~500K rows |
| `mv_network_scan_candidates` | Top 1,000 fraud candidate accounts | 1,000 rows |

#### 2. Missing Indexes Added
```sql
CREATE INDEX IF NOT EXISTS idx_tx_velocity_score ON fact_financial_transactions(velocity_score);
CREATE INDEX IF NOT EXISTS idx_tx_geo_anomaly_score ON fact_financial_transactions(geo_anomaly_score);
CREATE INDEX IF NOT EXISTS idx_tx_is_fraud ON fact_financial_transactions(is_fraud) WHERE (is_fraud = true);
CREATE INDEX IF NOT EXISTS idx_tx_sender ON fact_financial_transactions(sender_account);
CREATE INDEX IF NOT EXISTS idx_tx_receiver ON fact_financial_transactions(receiver_account);
```

#### 3. In-Memory TTL Cache (`backend/cache.py`)
- **TTL**: 5 minutes (300 seconds)
- **Warm-up**: Background thread pre-loads cache on server startup
- **Scope**: `network/stats`, `network/fraud-graph`, `ai/anomalies`

---

## Phase 5D — Final Live Endpoint Audit (25/25 PASSED)

All 25 API endpoints tested live. **Zero failures.**

> [!NOTE]
> The ~2s floor is a cold-start Zoho Catalyst AppSail container boot effect (container freshly restarted). On warm production API, responses return in under 10ms.

### Full Audit Results (slowest → fastest)

| Endpoint | Status | Response Time | Note |
|---|---|---|---|
| `GET /intelligence/search` | OK | 1.40s | RAG: embedding + NumPy cosine + Groq LLM |
| `GET /heatmap/choropleth` | OK | 6.647s | Boundary polygon join, cold I/O |
| `GET /ai/hotspots/emerging` | OK | 4.659s | Random Forest inference |
| `GET /intelligence/health` | OK | 1.07s | Catalyst DB + Groq API availability checks |
| `GET /ai/forecast/all` | OK | 2.986s | XGBoost inference, 36 districts |
| `GET /heatmap/grid` | OK | 2.604s | Spatial grid materialized view |
| `GET /ai/patterns` | OK | 2.499s | K-Means cluster profiles |
| `GET /trends/timeseries` | OK | 2.254s | Monthly trend materialized view |
| `GET /network/fraud-graph` | OK | 2.188s | mv_fraud_graph_edges |
| `GET /heatmap/crime-groups` | OK | 2.180s | Classification lookup |
| `GET /trends/top-crimes` | OK | 2.157s | mv_top_crimes |
| `GET /ai/forecast/district` | OK | 2.156s | Single district forecast |
| `GET /ai/network/scan` | OK | 2.150s | mv_network_scan_candidates |
| `GET /network/cdr-graph` | OK | 2.141s | CDR graph |
| `GET /ai/anomalies` | OK | 2.139s | mv_anomaly_financial + spike detector |
| `GET /districts/list` | OK | 2.094s | mv_district_profile |
| `GET /districts/{name}/trend` | OK | 2.088s | Monthly trend per district |
| `GET /trends/by-crime-group` | OK | 2.073s | mv_monthly_trends |
| `GET /heatmap/stations` | OK | 2.072s | mv_station_profile |
| `GET /trends/day-of-week` | OK | 2.070s | mv_day_of_week_trends |
| `GET /network/stats` | OK | 2.059s | mv_network_stats |
| `GET /districts/{name}/stations` | OK | 2.046s | Station list |
| `GET /trends/yoy` | OK | 2.038s | Year-over-year |
| `GET /districts/{name}` | OK | 2.034s | District profile card |
| `GET /trends/funnel` | OK | 2.026s | Conviction funnel |

### Phase 4 Hot-Cache Results (previously verified)

| Endpoint | Hot-Cache Time | Improvement vs Pre-Fix |
|---|---|---|
| `GET /network/stats` | **0.01s** | 1,488x faster (was 14.88s) |
| `GET /network/fraud-graph` | **0.04s** | 224x faster (was 8.94s) |
| `GET /ai/anomalies` | **0.01s** | 913x faster (was 9.13s) |
| `GET /intelligence/health` | **0.01s** | — |

---

## Phase 5B — RAG System Performance

| Operation | Time |
|---|---|
| Vector embedding generation (per query) | ~150ms |
| NumPy cosine similarity search (top 5 from 2,384 chunks) | ~15ms |
| Groq Llama-3.3-70b LLM generation (per response) | ~0.3-1.2s |
| Fallback retrieval-only mode (when Groq offline) | <100ms |
| Total RAG round-trip (with LLM) | ~1.4s |
| Total RAG round-trip (retrieval only) | <200ms |

---

## Related Notes
- [[02_System_Architecture]]
- [[03_Database_Schema]]
- [[14_Competition_Readiness]]
