# 01 — Project Overview

## Problem Statement

Karnataka Police manages over **1.67 million FIR records** annually, but crime intelligence has historically been siloed across jurisdictions, manually processed, and reactive. Police officers and analysts lack:

- Real-time visibility into emerging crime hotspots
- Predictive tools for crime prevention
- Financial fraud network detection
- Cross-domain correlation (crime + financial + CDR data)

## What Project Sentinel Does

Project Sentinel is a **unified crime intelligence platform** that transforms raw police data into actionable intelligence signals.

### Core Capabilities

| Capability | Description |
|-----------|-------------|
| **Crime Heatmap** | Real-time spatial crime density visualized at 1km² grid resolution |
| **Trend Analytics** | Monthly/yearly FIR trends by district and crime category |
| **District Drilldown** | Per-district intelligence: conviction funnel, top stations, temporal patterns |
| **Network Analysis** | Fraud transaction graph + CDR communication network analysis |
| **AI Forecasting** | XGBoost model predicting next-month crime counts per district |
| **AI Hotspot Prediction** | Random Forest classifier predicting high-risk police station zones |
| **Financial Risk Scoring** | Isolation Forest detecting money laundering networks |
| **Crime Pattern Clustering** | K-Means grouping stations and crime types into behavioral archetypes |
| **Anomaly Detection** | Multi-type anomaly feed: crime spikes, financial outliers, demographic anomalies |
| **Hybrid RAG Assistant** | LLM-grounded intelligence assistant backed by official crime PDFs + Zoho Catalyst Data Store |

## Impact

> "From raw FIRs to analyst-ready intelligence in under 2 seconds."

- **187,766** fraud transactions surfaced from 11.3M records
- **Hotspot prediction** covering all 36 Karnataka districts
- **Official NCRB crime reports** (2024) indexed and semantically queryable
- End-to-end ML pipeline from raw CSV → trained models → explainable predictions

## Technology Philosophy

Project Sentinel was built with one principle: **every output must be traceable to real data**.

- No synthetic data in production flows
- All AI explanations derived from actual model weights (not heuristics)
- All map coordinates derived from real police unit geolocation data
- All RAG answers cited to specific page/document sources

## Related Notes
- [[02_System_Architecture]]
- [[05_Datasets]]
- [[06_AI_Models]]
- [[12_Judge_Presentation]]
