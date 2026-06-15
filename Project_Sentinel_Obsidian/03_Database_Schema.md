# 03 — Database Schema

This document details the database architecture of Project Sentinel, including the Entity-Relationship Diagram (ERD), tables, indexes, and materialized views used to support high-performance analytical queries.

## Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    dim_date {
        int date_key PK
        date calendar_date UK
        int year
        int month
        varchar month_name
        int day_of_month
        int day_of_week
        varchar day_name
        int quarter
        boolean is_weekend
    }

    dim_police_units {
        int unit_id PK
        varchar unit_name
        varchar district_name
        varchar circle_name
        decimal latitude
        decimal longitude
    }

    dim_geography {
        varchar geo_id PK
        varchar district_name
        varchar sub_district_name
        varchar beat_name
        varchar village_area_name
        geometry geom
    }

    dim_demographics {
        varchar geo_id PK, FK
        int population_total
        int population_urban
        decimal literacy_rate
        decimal consumption_index
        decimal facebook_wealth_index
    }

    dim_crime_classification {
        int crime_class_id PK
        varchar crime_group_name
        varchar crime_head_name
    }

    dim_vehicles {
        varchar registration_number PK
        varchar owner_name
        varchar maker_name
        varchar vehicle_category_name
        varchar vehicle_model_name
        varchar fuel_name
        varchar vehicle_class_name
        int registration_year
    }

    dim_financial_accounts {
        varchar account_number PK
        varchar owner_name
        varchar bank_name
        decimal risk_score
    }

    fact_fir_events {
        varchar fir_id PK
        varchar fir_number
        int unit_id FK
        varchar geo_id FK
        int crime_class_id FK
        timestamp fir_date
        int offence_duration_minutes
        varchar fir_type
        varchar fir_stage
        varchar complaint_mode
        varchar io_name
        varchar io_kgid
        int victim_count
        int accused_count
        int arrested_count
        int conviction_count
        decimal latitude
        decimal longitude
        geometry geom
    }

    fact_financial_transactions {
        varchar transaction_id PK
        timestamp timestamp
        varchar sender_account FK
        varchar receiver_account FK
        decimal amount
        varchar transaction_type
        varchar merchant_category
        varchar location
        varchar device_used
        boolean is_fraud
        varchar fraud_type
        decimal velocity_score
        decimal geo_anomaly_score
    }

    fact_call_detail_records {
        int cdr_id PK
        varchar caller_number
        varchar receiver_number
        varchar caller_company
        varchar receiver_company
        timestamp call_timestamp
        int duration_seconds
        varchar cell_tower_id
    }

    rag_document_embeddings {
        bigint ROWID PK
        int chunk_id UK
        varchar document_name
        int page_number
        varchar text_content
        varchar metadata_json
        varchar embedding
    }

    dim_geography ||--|| dim_demographics : "has"
    dim_police_units ||--o{ fact_fir_events : "registers"
    dim_geography ||--o{ fact_fir_events : "covers"
    dim_crime_classification ||--o{ fact_fir_events : "classifies"
    dim_financial_accounts ||--o{ fact_financial_transactions : "sends"
    dim_financial_accounts ||--o{ fact_financial_transactions : "receives"
```

## Tables & Counts

The database is built on the cloud-based **Zoho Catalyst Data Store** using Zoho Catalyst Query Language (ZCQL) for analytical access. Vector operations are processed programmatically in-memory via NumPy to fit within AppSail runtime constraints, and spatial calculations are executed using custom spherical geometry modules.

| Table Name | Type | Row Count | Primary Key | Description |
|---|---|---|---|---|
| `dim_date` | Dimension | 6,209 | `ROWID` | Date dimension mapping calendars from 2010 to 2026. |
| `district_centroids` | Dimension | 36 | `ROWID` | Centroid coordinates for Karnataka districts to handle fallback geolocations. |
| `dim_police_units` | Dimension | 1,000+ | `ROWID` | Police stations, subdivisions, and their coordinates. |
| `dim_geography` | Dimension | - | `ROWID` | Administrative boundaries and divisions stored as WKT. |
| `dim_demographics` | Dimension | - | `ROWID` | Census 2011 population, literacy, and wealth indexes. |
| `dim_crime_classification`| Dimension | - | `ROWID` | Master list of crime groups and headings (cyber, murder, etc.) |
| `dim_vehicles` | Dimension | - | `ROWID` | Owner and model info for registered vehicles. |
| `dim_financial_accounts` | Dimension | 1,000,000+ | `ROWID` | Bank account numbers and their ML-assigned risk scores. |
| `fact_fir_events` | Fact | 20,000+ | `ROWID` | Primary crime reporting details containing spatial and legal stats. |
| `fact_financial_transactions` | Fact | 11,360,000+ | `ROWID` | Financial records of transactions with computed anomaly metrics. |
| `fact_call_detail_records` | Fact | 33,876 | `ROWID` | Call logs for communications analysis. |
| `rag_document_embeddings` | Fact (AI) | 2,384 | `ROWID` | Chunked documents with stringified 384-dimensional embeddings (loaded to NumPy vector cache). |

---

## Indexing Strategy

To optimize real-time searches across millions of records in Zoho Catalyst Data Store:

### 1. Unique and Field Indexes
- Unique indexes on natural keys (`chunk_id`, `unit_id`, `district_name`, `geo_id`, `fir_id`, `transaction_id`, `cdr_id`, `account_number`).
- Query-filter indexes on high-frequency search fields (`district_name`, `fir_date`, `sender_account`, `receiver_account`, `risk_score`).

### 2. Computational Vector & Spatial Acceleration
- In-memory NumPy hybrid cache mapping `rag_document_embeddings` rows into preloaded floating-point matrices. High-speed vector dot products calculate cosine similarity metrics.
- Mathematical spatial distance filtering within the Python FastAPI AppSail backend layer to find nearby police stations or anomalous financial transaction velocity points without postGIS requirements.

---

## Pre-Aggregated Analytic Tables

We precompute aggregations to avoid slow sequential scans over large datasets:

1. **`mv_district_profile`**: Precomputes overall crime and arrest counts by district.
2. **`mv_monthly_trends`**: Monthly crime volumes by category.
3. **`mv_station_profile`**: Crime volumes, arrests, and primary crime categories by station.
4. **`mv_network_stats`**: High-level network totals (total fraud, total CDR).
5. **`mv_fraud_graph_edges`**: Pre-joined sender and receiver profiles for fraud graph visualizer.
6. **`mv_anomaly_financial`**: Top anomalous financial transactions based on velocity and spatial deviation.

## Related Notes
- [[02_System_Architecture]]
- [[04_ETL_Pipeline]]
- [[05_Datasets]]
- [[13_Performance_Report]]
