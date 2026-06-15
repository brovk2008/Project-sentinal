# 07 — API Documentation

This document describes all API endpoints exposed by the Project Sentinel FastAPI backend. The API is structured under the prefix `/api/v1/` and runs on port `8001` (production) and `8000` (development).

---

## 1. RAG Intelligence Assistant Module (`/api/v1/intelligence/`)

### 1.1 `GET /health`
- **Description**: Returns the health state of the Catalyst Data Store, Catalyst File Store, Groq Cloud API, and NumPy vector search.
- **Response**:
  ```json
  {
    "status": "healthy",
    "catalyst_datastore": "online",
    "catalyst_filestore": "online",
    "groq_api": "available",
    "vector_search": "ready"
  }
  ```

### 1.2 `GET /search`
- **Description**: Semantic search query on the vector database.
- **Parameters**: `q` (string, query), `limit` (integer, default 5)
- **Response**: Returns matching chunks from documents with cosine similarity scores.

### 1.3 `POST /query`
- **Description**: Accepts questions, routes intent, executes analytics queries or does RAG, and generates structured, cited answers.
- **Request Body**: `{ "question": "Show fraud trend and explain money laundering patterns" }`
- **Response**: Includes grounded answer, cited sources, intent mode, and any analytics data.

### 1.4 `POST /analyze`
- **Description**: Runs DB analytics queries based on natural language inputs.
- **Request Body**: `{ "query": "district profiles" }`

### 1.5 `POST /briefing`
- **Description**: Assembles an intelligence briefing regarding a specific crime topic.
- **Request Body**: `{ "topic": "terrorism" }`

---

## 2. Spatiotemporal Crime Heatmap Module (`/api/v1/heatmap/`)

### 2.1 `GET /crime-groups`
- **Description**: List of all unique crime categories.

### 2.2 `GET /grid`
- **Description**: Returns 1km² spatial buckets with intensity scores.

### 2.3 `GET /stations`
- **Description**: All police units with coordinates and total FIR counts.

### 2.4 `GET /choropleth`
- **Description**: GeoJSON polygons with aggregated crime statistics.

---

## 3. Crime Trends Module (`/api/v1/trends/`)

### 3.1 `GET /timeseries`
- **Description**: Monthly or yearly historical crime counts.
- **Parameters**: `granularity` ("month" or "year")

### 3.2 `GET /by-crime-group`
- **Description**: Total counts grouped by crime category.

### 3.3 `GET /top-crimes`
- **Description**: Top 10 specific crime headings.

### 3.4 `GET /day-of-week`
- **Description**: Crime frequencies by day of the week.

### 3.5 `GET /yoy`
- **Description**: Year-over-Year growth rates.

### 3.6 `GET /funnel`
- **Description**: Conviction rates (FIR → Investigation → Chargesheet → Conviction).

---

## 4. District Intelligence Module (`/api/v1/districts/`)

### 4.1 `GET /`
- **Description**: Lists all 36 Karnataka districts with summary counts.

### 4.2 `GET /{name}`
- **Description**: Full summary card (earliest FIR, latest FIR, total FIRS, arrests, victims) for a specific district.

### 4.3 `GET /{name}/stations`
- **Description**: All police stations in a specific district.

### 4.4 `GET /{name}/trend`
- **Description**: Monthly crime trend for a specific district.

---

## 5. Network Analysis Module (`/api/v1/network/`)

### 5.1 `GET /stats`
- **Description**: Aggregates network statistics (materialized view driven).
- **Latency**: `< 10ms` (Pre-optimization: `14.88s`).

### 5.2 `GET /fraud-graph`
- **Description**: Graph node-link structure of fraud transfers.
- **Parameters**: `limit` (max edges)
- **Response**: `{ "nodes": [...], "edges": [...] }`

### 5.3 `GET /cdr-graph`
- **Description**: Communications network graph mapping call logs.

---

## 6. AI Intelligence Layer Module (`/api/v1/ai/`)

### 6.1 `GET /forecast/all`
- **Description**: Predictions for all districts with growth stats and XAI.

### 6.2 `GET /forecast/{district}`
- **Description**: Crime forecaster prediction for a specific district.

### 6.3 `GET /hotspots/emerging`
- **Description**: List of police stations predicted to become hotspots.

### 6.4 `GET /network/scan`
- **Description**: Money mule candidates ranked by risk scores.

### 6.5 `GET /network/detail/{account}`
- **Description**: Local transaction ego-network of a specific account.

### 6.6 `GET /patterns`
- **Description**: K-Means clustering profiles.

### 6.7 `GET /anomalies`
- **Description**: Aggregated feed of spatiotemporal and financial anomalies.

---

## Related Notes
- [[02_System_Architecture]]
- [[03_Database_Schema]]
- [[09_RAG_System]]
- [[13_Performance_Report]]
