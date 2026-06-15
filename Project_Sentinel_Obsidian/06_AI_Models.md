# 06 — AI Models

This document presents the Model Cards for the 5 machine learning models running in the Project Sentinel AI Intelligence Layer. These models power the forecasting, hotspot, network risk, clustering, and anomaly detection services.

---

## 1. Crime Risk Forecaster
- **Algorithm**: Random Forest Regressor (Chosen over XGBoost and LightGBM based on RMSE)
- **Task**: Predicts next-month crime counts per district.
- **Input Features**:
  - Historical monthly crime counts (lags 1, 2, 3, 12)
  - Rolling mean (3-month, 6-month)
  - District demographics (population, literacy rate, consumption index, Facebook RWI)
  - Temporal indices (month of year)
- **Target Output**: Predicted monthly FIR count for the next month.
- **Performance**:
  - **RMSE**: `10.5141` (RandomForest) vs `15.8925` (XGBoost) vs `11.6827` (LightGBM)
  - **Residual Std Dev**: `10.496`
  - **Training Time**: ~44s
- **Model File**: `backend/models/forecasting_model.joblib`

---

## 2. Crime Hotspot Predictor
- **Algorithm**: XGBoost Classifier (Chosen over RandomForest and LightGBM based on F1-Score)
- **Task**: Predicts if a police station zone will be a high-risk crime hotspot next month (defined as being in the top 20% of crime counts).
- **Input Features**:
  - Monthly crime lag features per station
  - Shift-share crime changes
  - Police unit coordinates
  - Demographic indices associated with station's coverage area
- **Target Output**: Binary label (1: High-risk hotspot, 0: Normal).
- **Performance**:
  - **F1-Score**: `0.1715` (XGBoost) vs `0.1544` (RandomForest) vs `0.1678` (LightGBM)
  - **Training Time**: ~10.7s
- **Model File**: `backend/models/hotspot_model.joblib`

---

## 3. Financial Network Risk Detector
- **Algorithm**: Isolation Forest (Unsupervised Anomaly Detection)
- **Task**: Scans financial accounts to detect money mule accounts and fraud network origins.
- **Input Features**:
  - Transaction count per account
  - Total transaction volume
  - Max and average transaction amount
  - Mean transaction velocity score
  - Mean geographic anomaly score
- **Target Output**: Anomaly score (negative values indicate anomalies).
- **Performance**:
  - **Decision Score Bounds**: Min `-0.1414` to Max `0.1792`
  - **Training Time**: ~18.8s
- **Model File**: `backend/models/network_anomaly_model.joblib`

---

## 4. Repeat Crime Pattern Classifier
- **Algorithm**: K-Means Clustering
- **Task**: Classifies police stations and crime heads into behavioral archetypes.
- **Input Features**:
  - **Station Clustering**: Spatial crime distributions, crime group ratios, average victim counts.
  - **Crime Head Clustering**: Offense duration, temporal patterns (day of week/month distributions), arrest-to-conviction rates.
- **Target Output**: Cluster Assignment (1 of 8 clusters, dynamically labeled based on centroid statistics to avoid hardcoding assumptions).
- **Performance**:
  - **Station Inertia**: `3568.85` (over 1,062 stations)
  - **Crime Inertia**: `240.53` (over 79 crime groups)
  - **Training Time**: ~5.9s
- **Model File**: `backend/models/patterns_model.joblib`

---

## 5. Spatiotemporal Anomaly Detector
- **Algorithm**: Hybrid Isolation Forest + Z-Score Deviation
- **Task**: Identifies multi-type anomalies across Karnataka districts (abrupt crime spikes, financial anomalies, demographic outliers).
- **Input Features**:
  - Monthly crime volumes
  - Financial transaction spikes
  - Demographic deviations
- **Target Output**: Binary anomaly label.
- **Performance**:
  - **Outlier Districts Detected**: 4 districts
  - **Crime Spikes Detected**: 100 spikes
  - **Financial Anomalies Detected**: 500 outliers
  - **Training Time**: ~3.2s
- **Model File**: `backend/models/district_anomaly_model.joblib`

---

## Related Notes
- [[02_System_Architecture]]
- [[03_Database_Schema]]
- [[05_Datasets]]
- [[13_Performance_Report]]
