# 11 — Demo Walkthrough

This document outlines a 7-step demonstration script for judges to explore the AI capabilities of **Project Sentinel** at local port `http://localhost:5173`.

---

## Step 1: Navigating the AI Threat Layer
1. Launch the dashboard at `http://localhost:5173`.
2. Locate the **AI Layer** section in the left sidebar, which holds the 5 intelligent threat modules.

---

## Step 2: Crime Risk Forecasting (FCT)
*Objective: Show predictive intelligence based on real Karnataka FIR aggregates.*
1. Click on **Risk Forecast** in the sidebar.
2. Observe the **State Predicted Next Month** KPI showing total forecasted incidents.
3. Click the header **Risk** on the main data table to sort by risk index. Note that high-risk zones rise to the top.
4. Click on any district (e.g., *Bengaluru City* or *Belagavi*).
5. The **XAI Analysis** panel on the right slides open:
   - Observe the **Feature Importance** list illustrating why the model assigned this risk score (e.g. lag counts, literacy rate, wealth index).
   - Read the **AI Explanation** describing the growth pattern in natural language.

---

## Step 3: Emerging Hotspots (HOT)
*Objective: Demonstrate geographic risk localization.*
1. Click on **Hotspot Predict** in the sidebar.
2. The page loads a **Leaflet Map** centered on Karnataka.
3. Observe the colored bubbles representing predicted hotspot coordinates:
   - **Red bubbles** indicate `CRITICAL` risk zones (surge probability > 80%).
   - **Yellow/Orange bubbles** indicate `HIGH` risk zones (surge probability 50%-80%).
4. Type a station name in the search filter (e.g. *Sindagi* or *Indi*).
5. Select a station from the feed list. The map automatically centers and zooms to the selected coordinate.
6. The **XAI Analysis** panel on the right populates with the model's confidence rating and attribution features.

---

## Step 4: Financial Network Risk (FIN)
*Objective: Identify transaction laundering networks.*
1. Click on **Financial Risk** in the sidebar.
2. Select any high-risk account number from the left-side scanner panel.
3. Watch the graph panel populate with a transaction subnetwork showing transaction connections:
   - Nodes are colored by their anomaly score (Red = Critical, Orange = Warning, Green = Safe).
   - Directed edges indicate cash transfer flows. **Red lines** highlight paths marked as known fraudulent links.
4. Check the **Subnetwork Topology** metrics in the sidebar:
   - Note if the account participates in **Transitive Loops** (circular wash trading paths) or has **Mule Neighbors**.
   - Read the natural language AI Threat Explanation explaining the structural graph anomaly.

---

## Step 5: Repeat Crime Patterns (PAT)
*Objective: Display cluster intelligence without synthetic personas.*
1. Click on **Crime Patterns** in the sidebar.
2. Observe the **8 Cluster Archetype Cards** at the top (e.g. *High-Volume Urban Hub*, *Violent Crime Hotspot*, *Financial Fraud Nexus*).
3. Click on the card **High-Volume Urban Hub** or **Violent Crime Hotspot**.
4. The tables below immediately filter to show:
   - All police stations grouped into this cluster.
   - All crime categories corresponding to this cluster's characteristics.
5. Hover over the **Arrests vs Convictions** bar chart to see statistical performance ratios for each cluster.

---

## Step 6: Unified Threat Feed (ANO)
*Objective: Show threat monitoring.*
1. Click on **Anomaly Feed** in the sidebar.
2. Filter the feed by choosing **Alert Type: Crime Spikes** or **Severity: Critical**.
3. Select an alert card from the list:
   - Notice the left border highlight (Red for Critical, Yellow for High).
   - Review the comparison metrics (e.g. Observed Volume vs Historical Baseline).
   - Read the AI Explanation detailing why this specific month, transaction, or district represents a statistical anomaly.

---

## Step 7: Intelligence Assistant (RAG Terminal)
*Objective: Demonstrate grounded, cited QA using cloud-hosted Groq LLMs and official crime PDFs.*
1. Click on **Intelligence Assistant** in the sidebar.
2. Note the command-line aesthetic of the terminal.
3. Type the following queries into the terminal to demonstrate different routing intents:
   - **Analytics (SQL)**: `"Compare Belagavi and Mysuru"`
     - *Observation*: The assistant routes the request directly to the Zoho Catalyst Data Store and formats a clean markdown table comparing crime metrics in `< 50ms` with **no LLM latency**.
   - **Hybrid RAG**: `"Why is financial crime increasing in Karnataka?"`
     - *Observation*: The assistant retrieves database aggregates for fraud volume along with chunks from `Technology.pdf` or `Terrorism.pdf`, producing a grounded summary with sources and database tables.
   - **Knowledge RAG**: `"What is the definition of organised crime?"`
     - *Observation*: The assistant queries the `rag_document_embeddings` table in the Catalyst Data Store via the in-memory vector similarity index, retrieves relevant pages from `Organised crime.pdf`, and generates an answer citing exact page numbers.
4. Expand the **Retrieval Sources** drawer beneath the answer to show the exact text chunks extracted from the database, proving that the model is grounded and cannot hallucinate.

## Related Notes
- [[01_Project_Overview]]
- [[02_System_Architecture]]
- [[08_Frontend_Architecture]]
- [[09_RAG_System]]
- [[12_Judge_Presentation]]
