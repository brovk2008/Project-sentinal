# 12 — Judge Presentation Guide

This guide highlights the key technical differentiators, talking points, and impact metrics that make Project Sentinel a winning platform for the hackathon.

---

## 1. Technical Differentiators (Why Sentinel Wins)

Many hackathon projects build mock dashboards with static charts and call OpenAI API with simple wrappers. Project Sentinel stands out because of its engineering depth:

1. **Real Data at Scale**:
   - **No mock data in production flows**. The system is built on **11.3 Million financial transactions**, **1.67 Million real police FIRs**, and **33,876 CDR events** seeded in Zoho Catalyst Data Store and optimized file chunks.
2. **Dynamic Spatial Bucketing**:
   - Instead of crude scatter plots, Sentinel uses spatial bounding boxes and coordinate lookups to map spatial crime densities down to **1km² grid resolution** across Karnataka.
3. **Traceable & Grounded Production RAG**:
   - The LLM is **not** the knowledge source; it only acts as the synthesizer. Answers are strictly synthesized from retrieved files (including PDFs, CSVs, Excels, GeoJSONs, KMLs, and Shapefiles) and cite exact document sources and page/row numbers.
   - Includes a **Retrieval-only fallback** so that the service remains functional and presents matching chunks even if the cloud LLM goes offline.
4. **Explainable AI (XAI)**:
   - Forecasts and hotspots display actual model feature importances (`feature_importances_` weights from trained XGBoost/Random Forest models) and deviation statistics, rather than fake static explanations.
5. **Production-Ready Latencies**:
   - Through **optimized table indexes** and precomputations, complex aggregates that previously took `14.88 seconds` now execute in **under 10 milliseconds** on Catalyst.

---

## 2. Key Talking Points by Role

### The Data Engineer (Scale & Pipeline)
- *"We built a robust topological ETL pipeline in python that cleans, links, and ingests 13M total rows. We solved the 68% coordinate-missingness issue in police files by compiling a Census-2011 district centroid mapping that assigns accurate spatial fallbacks without map clustering failures."*
- *"We designed optimized table indexes and precomputed views in Zoho Catalyst Data Store to shift heavy calculations from API runtime to pre-computations. Combined with in-memory TTL caching, our dashboard endpoints respond in under 10ms."*

### The AI/ML Engineer (Models & XAI)
- *"We trained 5 separate machine learning models: XGBoost for forecasting, Random Forest for hotspot prediction, K-Means for cluster patterns, and Isolation Forests for financial and crime anomalies. All forecasting and hotspot models are evaluated against RMSE/F1 score baselines."*
- *"We didn't want black-box AI. Every prediction is backed by model weights, showing the analyst exactly which features (like historic lags, population density, or wealth indices) contributed to the risk score."*
- *"Our RAG assistant runs in the cloud using Llama-3.3-70b-versatile via Groq. It classifies queries on the fly, routing analytical questions to Catalyst Data Store ZCQL and semantic definitions to in-memory NumPy vector embeddings."*

### The UX/UI Designer (Dark Monochrome Aesthetic)
- *"We designed an immersive, high-trust dark monochrome command-center interface. We stripped out all unnecessary colors, gradients, and animations, using red accents strictly for threat levels and critical risk alerts."*

---

## 3. RAG Query Examples to Show Judges

To show the RAG system's versatility, type these live during the demo:

| Query Type | What to Type | Expected Response | Why it's Cool |
|---|---|---|---|
| **SQL Routing** | `Compare Belagavi and Mysuru` | Instant markdown table comparing FIR counts, arrests, and convictions. | Shows direct database querying without LLM latency. |
| **Hybrid Analysis** | `Explain money laundering trends and stats` | Combined summary text with financial totals from the database and citations from crime documents. | Showcases multi-source information synthesis. |
| **Semantic Search** | `What is the definition of organised crime?` | Detailed answer referencing `Organised crime.pdf` (Page X). | Demonstrates localized knowledge vault retrieval. |

## Related Notes
- [[01_Project_Overview]]
- [[02_System_Architecture]]
- [[09_RAG_System]]
- [[11_Demo_Walkthrough]]
