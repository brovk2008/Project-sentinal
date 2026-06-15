import os
import joblib
import numpy as np
import pandas as pd
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from db import get_db, CatalystDBClient
from ml import explainability, anomaly, network_risk

router = APIRouter(tags=["AI Intelligence Layer"])

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")

def get_district_demographics(d_name: str, demo_map: dict) -> dict:
    key = f"DISTRICT_{d_name.upper()}"
    if key in demo_map:
        return demo_map[key]
        
    norm = d_name.upper()
    translations = {
        'BENGALURU CITY': 'BANGALORE',
        'BENGALURU DIST': 'BANGALORE RURAL',
        'KARNATAKA RAILWAYS': 'BANGALORE',
        'CID': 'BANGALORE',
        'ISD BENGALURU': 'BANGALORE',
        'BENGALURU RURAL': 'BANGALORE RURAL',
        'MYSURU CITY': 'MYSORE',
        'MYSURU DIST': 'MYSORE',
        'MANGALURU CITY': 'DAKSHINA KANNADA',
        'BELAGAVI CITY': 'BELGAUM',
        'BELAGAVI DIST': 'BELGAUM',
        'KALABURAGI CITY': 'GULBARGA',
        'KALABURAGI': 'GULBARGA',
        'BALLARI': 'BELLARY',
        'VIJAYANAGARA': 'BELLARY',
        'TUMAKURU': 'TUMKUR',
        'SHIVAMOGGA': 'SHIMOGA',
        'CHICKBALLAPURA': 'CHIKKABALLAPURA',
        'CHIKKAMAGALURU': 'CHIKMAGALUR',
        'VIJAYAPUR': 'BIJAPUR',
        'HUBBALLI DHARWAD CITY': 'DHARWAD',
        'K.G.F': 'KOLAR',
        'COASTAL SECURITY POLICE': 'UDUPI'
    }
    target = translations.get(norm, norm)
    return demo_map.get(f"DISTRICT_{target}", {
        "population_total": 2000000.0,
        "literacy_rate": 70.0,
        "facebook_wealth_index": 0.0,
        "consumption_index": 1.0
    })

# Lazy model loaders
_FORECAST_PAYLOAD = None
_HOTSPOT_PAYLOAD = None
_NETWORK_PAYLOAD = None
_PATTERNS_PAYLOAD = None

def load_forecast_payload():
    global _FORECAST_PAYLOAD
    if _FORECAST_PAYLOAD is None:
        path = os.path.join(MODEL_DIR, "forecast_model.joblib")
        if not os.path.exists(path):
            raise HTTPException(status_code=500, detail="Forecasting model file not found. Run training first.")
        _FORECAST_PAYLOAD = joblib.load(path)
    return _FORECAST_PAYLOAD

def load_hotspot_payload():
    global _HOTSPOT_PAYLOAD
    if _HOTSPOT_PAYLOAD is None:
        path = os.path.join(MODEL_DIR, "hotspot_model.joblib")
        if not os.path.exists(path):
            raise HTTPException(status_code=500, detail="Hotspot model file not found. Run training first.")
        _HOTSPOT_PAYLOAD = joblib.load(path)
    return _HOTSPOT_PAYLOAD

def load_network_payload():
    global _NETWORK_PAYLOAD
    if _NETWORK_PAYLOAD is None:
        path = os.path.join(MODEL_DIR, "network_anomaly_model.joblib")
        if not os.path.exists(path):
            raise HTTPException(status_code=500, detail="Financial network model file not found. Run training first.")
        _NETWORK_PAYLOAD = joblib.load(path)
    return _NETWORK_PAYLOAD

def load_patterns_payload():
    global _PATTERNS_PAYLOAD
    if _PATTERNS_PAYLOAD is None:
        path = os.path.join(MODEL_DIR, "patterns_model.joblib")
        if not os.path.exists(path):
            raise HTTPException(status_code=500, detail="Patterns model file not found. Run training first.")
        _PATTERNS_PAYLOAD = joblib.load(path)
    return _PATTERNS_PAYLOAD


# ─────────────────────────────────────────────────────────────────────────────
# 1. Crime Risk Forecasting Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/forecast/all")
def get_state_forecasting(db: CatalystDBClient = Depends(get_db)):
    """
    Predicts crime counts for next month across all districts in Karnataka.
    Calculates district-level risk scores (0-100) and aggregates state total.
    """
    payload = load_forecast_payload()
    model = payload["model"]
    features_list = payload["features"]
    le_district = payload["le_district"]
    le_crime = payload["le_crime"]
    std_residuals = payload["std_residuals"]

    # Load monthly trends for the latest 3 months in Python
    sql_trends = """
        SELECT district_name, crime_group_name, month, fir_count
        FROM mv_monthly_trends
        WHERE month = '2024-03-01' OR month = '2024-02-01' OR month = '2024-01-01';
    """
    trends_rows = db.execute(sql_trends).fetchall()
    if not trends_rows:
        raise HTTPException(status_code=404, detail="No historical lag data found in database.")

    # Load demographics
    demo_rows = db.execute("SELECT geo_id, population_total, literacy_rate, facebook_wealth_index, consumption_index FROM dim_demographics;").fetchall()
    demo_map = {}
    for r in demo_rows:
        demo_map[str(r[0])] = {
            "population_total": float(r[1] or 2000000.0),
            "literacy_rate": float(r[2] or 70.0),
            "facebook_wealth_index": float(r[3] or 0.0),
            "consumption_index": float(r[4] or 1.0)
        }

    # Group and pivot
    groups = {}
    for r in trends_rows:
        dist = str(r[0])
        crime = str(r[1])
        m = str(r[2])
        val = float(r[3] or 0.0)
        
        key = (dist, crime)
        if key not in groups:
            groups[key] = {"lag_1": 0.0, "lag_2": 0.0, "lag_3": 0.0}
        
        m_prefix = m[:10]
        if m_prefix == '2024-03-01':
            groups[key]["lag_1"] = val
        elif m_prefix == '2024-02-01':
            groups[key]["lag_2"] = val
        elif m_prefix == '2024-01-01':
            groups[key]["lag_3"] = val

    raw_data = []
    for (dist, crime), lags in groups.items():
        demo = get_district_demographics(dist, demo_map)
        lag_1 = lags["lag_1"]
        lag_2 = lags["lag_2"]
        lag_3 = lags["lag_3"]
        rolling_mean_3 = (lag_1 + lag_2 + lag_3) / 3.0
        
        raw_data.append({
            "district_name": dist,
            "crime_group_name": crime,
            "lag_1": lag_1,
            "lag_2": lag_2,
            "lag_3": lag_3,
            "rolling_mean_3": rolling_mean_3,
            "population_total": demo["population_total"],
            "literacy_rate": demo["literacy_rate"],
            "facebook_wealth_index": demo["facebook_wealth_index"],
            "consumption_index": demo["consumption_index"],
            "month_val": 4
        })

    df = pd.DataFrame(raw_data)
    if df.empty:
        raise HTTPException(status_code=404, detail="No trends data processed.")

    # Encode label variables
    df["district_code"] = df["district_name"].map(
        lambda x: le_district.transform([x])[0] if x in le_district.classes_ else 0
    )
    df["crime_code"] = df["crime_group_name"].map(
        lambda x: le_crime.transform([x])[0] if x in le_crime.classes_ else 0
    )

    X = df[features_list]
    df["prediction"] = np.clip(model.predict(X), 0.0, None)

    district_groups = df.groupby("district_name")
    district_res = []
    state_predicted_total = 0.0
    state_current_total = 0.0

    for dist_name, group in district_groups:
        pred_sum = float(group["prediction"].sum())
        curr_sum = float(group["lag_1"].sum())
        pop = float(group["population_total"].iloc[0])
        literacy = float(group["literacy_rate"].iloc[0])
        wealth = float(group["facebook_wealth_index"].iloc[0])

        crime_rate_per_100k = (pred_sum / pop) * 1e5
        risk_score = min(100.0, max(0.0, (crime_rate_per_100k / 300.0) * 100.0))

        state_predicted_total += pred_sum
        state_current_total += curr_sum

        residual = abs(pred_sum - curr_sum)
        confidence = float(np.exp(-(residual / (std_residuals or 1.0)) ** 2))
        confidence = min(0.99, max(0.60, confidence))

        xai = explainability.explain_prediction(
            "forecasting",
            pred_sum,
            {
                "district": dist_name,
                "crime_group": "Overall Crime",
                "lag_1": curr_sum,
                "literacy_rate": literacy,
                "facebook_wealth_index": wealth
            },
            confidence=confidence
        )

        district_res.append({
            "district": dist_name,
            "predicted_firs": round(pred_sum, 1),
            "current_firs": int(curr_sum),
            "risk_score": round(risk_score, 1),
            "confidence": xai["confidence"],
            "explanation": xai["explanation"],
            "feature_importance": xai["feature_importance"]
        })

    district_res.sort(key=lambda x: x["risk_score"], reverse=True)
    growth_percent = 0.0
    if state_current_total > 0:
        growth_percent = round(100.0 * (state_predicted_total - state_current_total) / state_current_total, 2)

    return {
        "state_summary": {
            "predicted_total": round(state_predicted_total, 1),
            "current_total": int(state_current_total),
            "growth_percent": growth_percent
        },
        "districts": district_res
    }

@router.get("/forecast/{district}")
def get_district_forecasting(district: str, db: CatalystDBClient = Depends(get_db)):
    """
    Returns next month's crime forecasts for a specific district,
    broken down by individual crime groups.
    """
    payload = load_forecast_payload()
    model = payload["model"]
    features_list = payload["features"]
    le_district = payload["le_district"]
    le_crime = payload["le_crime"]
    std_residuals = payload["std_residuals"]

    sql_trends = """
        SELECT district_name, crime_group_name, month, fir_count
        FROM mv_monthly_trends
        WHERE UPPER(district_name) = UPPER(:district)
          AND (month = '2024-03-01' OR month = '2024-02-01' OR month = '2024-01-01');
    """
    trends_rows = db.execute(sql_trends, {"district": district}).fetchall()
    if not trends_rows:
        raise HTTPException(status_code=404, detail=f"District '{district}' not found or has no trend data.")

    # Load demographics
    demo_rows = db.execute("SELECT geo_id, population_total, literacy_rate, facebook_wealth_index, consumption_index FROM dim_demographics;").fetchall()
    demo_map = {}
    for r in demo_rows:
        demo_map[str(r[0])] = {
            "population_total": float(r[1] or 2000000.0),
            "literacy_rate": float(r[2] or 70.0),
            "facebook_wealth_index": float(r[3] or 0.0),
            "consumption_index": float(r[4] or 1.0)
        }

    # Group and pivot
    groups = {}
    for r in trends_rows:
        dist = str(r[0])
        crime = str(r[1])
        m = str(r[2])
        val = float(r[3] or 0.0)
        
        key = (dist, crime)
        if key not in groups:
            groups[key] = {"lag_1": 0.0, "lag_2": 0.0, "lag_3": 0.0}
        
        m_prefix = m[:10]
        if m_prefix == '2024-03-01':
            groups[key]["lag_1"] = val
        elif m_prefix == '2024-02-01':
            groups[key]["lag_2"] = val
        elif m_prefix == '2024-01-01':
            groups[key]["lag_3"] = val

    raw_data = []
    for (dist, crime), lags in groups.items():
        demo = get_district_demographics(dist, demo_map)
        lag_1 = lags["lag_1"]
        lag_2 = lags["lag_2"]
        lag_3 = lags["lag_3"]
        rolling_mean_3 = (lag_1 + lag_2 + lag_3) / 3.0
        
        raw_data.append({
            "district_name": dist,
            "crime_group_name": crime,
            "lag_1": lag_1,
            "lag_2": lag_2,
            "lag_3": lag_3,
            "rolling_mean_3": rolling_mean_3,
            "population_total": demo["population_total"],
            "literacy_rate": demo["literacy_rate"],
            "facebook_wealth_index": demo["facebook_wealth_index"],
            "consumption_index": demo["consumption_index"],
            "month_val": 4
        })

    df = pd.DataFrame(raw_data)
    if df.empty:
        raise HTTPException(status_code=404, detail="No trends data processed.")

    # Encode label variables
    df["district_code"] = df["district_name"].map(
        lambda x: le_district.transform([x])[0] if x in le_district.classes_ else 0
    )
    df["crime_code"] = df["crime_group_name"].map(
        lambda x: le_crime.transform([x])[0] if x in le_crime.classes_ else 0
    )

    X = df[features_list]
    df["prediction"] = np.clip(model.predict(X), 0.0, None)

    crime_res = []
    total_predicted = 0.0
    total_current = 0.0

    for _, row_item in df.iterrows():
        pred = float(row_item["prediction"])
        curr = float(row_item["lag_1"])
        c_group = row_item["crime_group_name"]

        total_predicted += pred
        total_current += curr

        residual = abs(pred - curr)
        confidence = float(np.exp(-(residual / (std_residuals or 1.0)) ** 2))
        confidence = min(0.99, max(0.60, confidence))

        xai = explainability.explain_prediction(
            "forecasting",
            pred,
            {
                "district": district,
                "crime_group": c_group,
                "lag_1": curr,
                "literacy_rate": row_item["literacy_rate"],
                "facebook_wealth_index": row_item["facebook_wealth_index"]
            },
            confidence=confidence
        )

        crime_res.append({
            "crime_group": c_group,
            "predicted_firs": round(pred, 2),
            "current_firs": int(curr),
            "confidence": xai["confidence"],
            "explanation": xai["explanation"],
            "feature_importance": xai["feature_importance"]
        })

    crime_res.sort(key=lambda x: x["predicted_firs"], reverse=True)
    
    # Calibrate risk score
    pop = float(df["population_total"].iloc[0])
    crime_rate_per_100k = (total_predicted / pop) * 1e5
    risk_score = min(100.0, max(0.0, (crime_rate_per_100k / 300.0) * 100.0))
    
    return {
        "district": district,
        "predicted_total": round(total_predicted, 1),
        "current_total": int(total_current),
        "risk_score": round(risk_score, 1),
        "crime_groups": crime_res
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. Crime Hotspot Prediction Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/hotspots/emerging")
def get_emerging_hotspots(db: CatalystDBClient = Depends(get_db)):
    """
    Returns the top 50 emerging crime hotspots (police stations classified as
    having a crime surge next month).
    """
    payload = load_hotspot_payload()
    model = payload["model"]
    features_list = payload["features"]
    le_district = payload["le_district"]

    # Load district centroids into memory for fast fallback coordinates lookup
    centroids_rows = db.execute("SELECT district_name, latitude, longitude FROM district_centroids;").fetchall()
    centroids_map = {str(r[0]).upper(): (float(r[1]), float(r[2])) for r in centroids_rows}

    def get_district_centroid(d_name: str, centroids_map: dict):
        norm = d_name.upper()
        translations = {
            'BENGALURU CITY': 'BANGALORE',
            'BENGALURU DIST': 'BANGALORE RURAL',
            'KARNATAKA RAILWAYS': 'BANGALORE',
            'CID': 'BANGALORE',
            'ISD BENGALURU': 'BANGALORE',
            'BENGALURU RURAL': 'BANGALORE RURAL',
            'MYSURU CITY': 'MYSORE',
            'MYSURU DIST': 'MYSORE',
            'MANGALURU CITY': 'DAKSHINA KANNADA',
            'BELAGAVI CITY': 'BELGAUM',
            'BELAGAVI DIST': 'BELGAUM',
            'KALABURAGI CITY': 'GULBARGA',
            'KALABURAGI': 'GULBARGA',
            'BALLARI': 'BELLARY',
            'VIJAYANAGARA': 'BELLARY',
            'TUMAKURU': 'TUMKUR',
            'SHIVAMOGGA': 'SHIMOGA',
            'CHICKBALLAPURA': 'CHIKKABALLAPURA',
            'CHIKKAMAGALURU': 'CHIKMAGALUR',
            'VIJAYAPUR': 'BIJAPUR',
            'HUBBALLI DHARWAD CITY': 'DHARWAD',
            'K.G.F': 'KOLAR',
            'COASTAL SECURITY POLICE': 'UDUPI'
        }
        target = translations.get(norm, norm)
        return centroids_map.get(target, (12.9716, 77.5946))

    # Fetch FIR events registered from 2023-12-01 onwards
    sql_events = """
        SELECT 
            f.unit_id,
            pu.unit_name,
            pu.district_name,
            pu.latitude,
            pu.longitude,
            f.fir_date
        FROM fact_fir_events f
        JOIN dim_police_units pu ON f.unit_id = pu.unit_id
        WHERE f.fir_date >= '2023-12-01';
    """
    rows = db.execute(sql_events).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No historical station data found.")

    # Group station records by month in Python
    station_groups = {}
    for r in rows:
        unit_id = int(r[0])
        unit_name = str(r[1])
        dist_name = str(r[2])
        lat = float(r[3]) if r[3] is not None else None
        lng = float(r[4]) if r[4] is not None else None
        fir_date = str(r[5])
        
        month = fir_date[:7] + "-01"
        
        if unit_id not in station_groups:
            station_groups[unit_id] = {
                "unit_name": unit_name,
                "district_name": dist_name,
                "lat": lat,
                "lng": lng,
                "counts": {"2024-03-01": 0.0, "2024-02-01": 0.0, "2024-01-01": 0.0, "2023-12-01": 0.0}
            }
        if month in station_groups[unit_id]["counts"]:
            station_groups[unit_id]["counts"][month] += 1.0

    raw_data = []
    for unit_id, info in station_groups.items():
        lat = info["lat"]
        lng = info["lng"]
        if lat is None or lng is None:
            lat, lng = get_district_centroid(info["district_name"], centroids_map)
            
        counts = info["counts"]
        fir_count = counts["2024-03-01"]
        lag_1 = counts["2024-02-01"]
        lag_2 = counts["2024-01-01"]
        lag_3 = counts["2023-12-01"]
        mean_3 = (lag_1 + lag_2 + lag_3) / 3.0
        
        raw_data.append({
            "unit_id": unit_id,
            "unit_name": info["unit_name"],
            "district_name": info["district_name"],
            "latitude": lat,
            "longitude": lng,
            "fir_count": fir_count,
            "lag_1": lag_1,
            "lag_2": lag_2,
            "lag_3": lag_3,
            "mean_3": mean_3,
            "month_val": 4
        })

    df = pd.DataFrame(raw_data)
    if df.empty:
        raise HTTPException(status_code=404, detail="No station data processed.")

    # Encode district names
    df["district_code"] = df["district_name"].map(
        lambda x: le_district.transform([x])[0] if x in le_district.classes_ else 0
    )

    # Predict probabilities
    X = df[features_list]
    probs = model.predict_proba(X)[:, 1]
    df["probability"] = probs

    # Sort and take top 50 hotspot prospects
    df_hot = df.sort_values("probability", ascending=False).head(50).copy()

    hotspots = []
    for _, r_item in df_hot.iterrows():
        p_val = float(r_item["probability"])
        u_name = r_item["unit_name"]

        # Risk thresholds
        if p_val > 0.8:
            risk_level = "CRITICAL"
        elif p_val > 0.5:
            risk_level = "HIGH"
        else:
            risk_level = "MEDIUM"

        xai = explainability.explain_prediction(
            "hotspot",
            p_val,
            {
                "station_name": u_name,
                "lag_1": r_item["lag_1"]
            },
            confidence=p_val
        )

        hotspots.append({
            "unit_id": int(r_item["unit_id"]),
            "unit_name": u_name,
            "district_name": r_item["district_name"],
            "latitude": float(r_item["latitude"]),
            "longitude": float(r_item["longitude"]),
            "probability": round(p_val, 4),
            "risk_level": risk_level,
            "confidence": xai["confidence"],
            "explanation": xai["explanation"],
            "feature_importance": xai["feature_importance"]
        })

    return hotspots


# ─────────────────────────────────────────────────────────────────────────────
# 3. Financial Network Risk Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/network/scan")
def scan_network_risk(db: CatalystDBClient = Depends(get_db)):
    """
    Scans accounts and returns a list of high-risk financial entities.
    Runs the trained Isolation Forest on candidate accounts to detect anomaly scores.
    """
    payload = load_network_payload()
    clf = payload["model"]
    features_list = payload["features"]
    min_score = payload["min_score"]
    max_score = payload["max_score"]

    # Select candidate accounts from materialized view
    sql = """
        SELECT
            account_number,
            total_amount,
            avg_amount,
            max_amount,
            tx_count,
            velocity_mean,
            geo_anomaly_mean
        FROM mv_network_scan_candidates;
    """
    
    rows = db.execute(sql).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No transactions found.")

    raw_accounts = []
    for r in rows:
        raw_accounts.append({
            "account_number": str(r[0]),
            "total_amount": float(r[1] or 0.0),
            "avg_amount": float(r[2] or 0.0),
            "max_amount": float(r[3] or 0.0),
            "tx_count": int(r[4] or 0),
            "velocity_mean": float(r[5] or 0.0),
            "geo_anomaly_mean": float(r[6] or 0.0)
        })
        
    df = pd.DataFrame(raw_accounts)
    X = df[features_list].fillna(0.0)
    
    # Calculate anomaly decision scores
    df["decision"] = clf.decision_function(X)
    
    # Calibrate risk score (0-100)
    risk_scores = []
    for dec in df["decision"]:
        if dec <= 0:
            risk = 50.0 + 50.0 * (min(0.0, dec) / (min_score or -1e-5))
        else:
            risk = 50.0 * (1.0 - (dec / (max_score or 1e-5)))
        risk_scores.append(min(100.0, max(0.0, risk)))
    
    df["risk_score"] = risk_scores
    
    # Filter and sort by risk score
    df_high = df.sort_values("risk_score", ascending=False).head(30).copy()
    
    high_risk_list = []
    for _, r_item in df_high.iterrows():
        acc = r_item["account_number"]
        r_score = float(r_item["risk_score"])
        
        # Estimate degrees/loops for placeholder XAI details on list-view scan
        xai = explainability.explain_prediction(
            "network",
            r_score,
            {
                "account_number": acc,
                "cycles_count": 1 if r_score > 75 else 0,
                "in_degree": int(r_item["tx_count"] * 0.4),
                "out_degree": int(r_item["tx_count"] * 0.6),
                "velocity": r_item["velocity_mean"],
                "fraud_neighbors": 1 if r_score > 80 else 0
            },
            confidence=0.90
        )
        
        high_risk_list.append({
            "account_number": acc,
            "risk_score": round(r_score, 1),
            "total_amount": round(float(r_item["total_amount"]), 2),
            "tx_count": int(r_item["tx_count"]),
            "avg_velocity": round(float(r_item["velocity_mean"]), 2),
            "avg_geo_anomaly": round(float(r_item["geo_anomaly_mean"]), 2),
            "confidence": xai["confidence"],
            "explanation": xai["explanation"],
            "feature_importance": xai["feature_importance"]
        })
        
    return high_risk_list

@router.get("/network/detail/{account_number}")
def get_account_network_detail(account_number: str):
    """
    Given an account number, generates the transaction graph subnetwork,
    calculates metrics, and evaluates laundering risk.
    """
    res = network_risk.analyze_account_network(account_number)
    
    xai = explainability.explain_prediction(
        "network",
        res["risk_score"],
        {
            "account_number": account_number,
            "cycles_count": res["metrics"]["cycles_count"],
            "in_degree": res["metrics"]["in_degree"],
            "out_degree": res["metrics"]["out_degree"],
            "velocity": res["metrics"]["velocity"],
            "fraud_neighbors": res["metrics"]["fraud_neighbors"]
        },
        confidence=0.90
    )
    
    res["explanation"] = xai["explanation"]
    res["confidence"] = xai["confidence"]
    res["feature_importance"] = xai["feature_importance"]
    
    return res


# ─────────────────────────────────────────────────────────────────────────────
# 4. Repeat Crime Pattern Intelligence Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/patterns")
def get_crime_patterns():
    """
    Loads K-Means models and returns clustered police stations and crime groups,
    accompanied by statistical characteristics and XAI explanations.
    """
    payload = load_patterns_payload()
    station_df = payload["station_df"]
    crime_df = payload["crime_df"]
    cluster_labels = payload["cluster_labels"]
    metrics = payload["metrics"]

    # 1. Format station clusters
    # Limit list size to 200 for clean visualization, sorting by volume
    stations_list = []
    for _, row in station_df.head(200).iterrows():
        c_val = int(row["cluster"])
        c_label = row["cluster_label"]
        st_name = row["unit_name"]
        
        # Calculate cluster assignment confidence based on cluster proximity (mocked helper)
        xai = explainability.explain_prediction(
            "patterns",
            c_label,
            {
                "name": st_name,
                "type": "station",
                "total_firs": int(row["total_firs"]),
                "arrest_rate": float(row["arrest_rate"]),
                "conviction_rate": float(row["conviction_rate"]),
                "weekend_ratio": float(row["weekend_ratio"])
            },
            confidence=0.88
        )
        
        stations_list.append({
            "unit_id": int(row["unit_id"]),
            "unit_name": st_name,
            "district_name": row["district_name"],
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
            "total_firs": int(row["total_firs"]),
            "arrest_rate": float(row["arrest_rate"]),
            "conviction_rate": float(row["conviction_rate"]),
            "cluster": c_val,
            "cluster_label": c_label,
            "confidence": xai["confidence"],
            "explanation": xai["explanation"],
            "feature_importance": xai["feature_importance"]
        })

    # 2. Format crime group clusters
    crimes_list = []
    for _, row in crime_df.iterrows():
        c_val = int(row["cluster"])
        c_label = row["cluster_label"]
        cg_name = row["crime_group_name"]
        
        xai = explainability.explain_prediction(
            "patterns",
            c_label,
            {
                "name": cg_name,
                "type": "crime",
                "total_firs": int(row["total_firs"]),
                "arrest_rate": float(row["arrest_rate"]),
                "conviction_rate": float(row["conviction_rate"]),
                "district_spread": int(row["district_spread"])
            },
            confidence=0.91
        )
        
        crimes_list.append({
            "crime_group_name": cg_name,
            "total_firs": int(row["total_firs"]),
            "arrest_rate": float(row["arrest_rate"]),
            "conviction_rate": float(row["conviction_rate"]),
            "cluster": c_val,
            "cluster_label": c_label,
            "confidence": xai["confidence"],
            "explanation": xai["explanation"],
            "feature_importance": xai["feature_importance"]
        })

    return {
        "metrics": metrics,
        "cluster_archetypes": cluster_labels,
        "stations": stations_list,
        "crime_groups": crimes_list
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. Anomaly Detection Feed Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/anomalies")
def get_anomalies_feed():
    """
    Returns a unified threat feed of crime count spikes, suspicious financial transactions,
    and demographic outlier districts, complete with XAI calibrations.
    """
    raw_anoms = anomaly.get_all_anomalies()
    enriched = []
    
    for raw in raw_anoms:
        # Calibrate statistical inputs for XAI
        is_anom = True
        severity = raw.get("severity", "LOW")
        val = 0.0
        expected = 0.0
        
        if raw["type"] == "crime_spike":
            val = float(raw["value"])
            expected = float(raw["expected"])
        elif raw["type"] == "financial_anomaly":
            val = float(raw["velocity_score"] + raw["geo_anomaly_score"])
            expected = 1.0 # Base threshold level
        elif raw["type"] == "district_outlier":
            val = abs(float(raw["anomaly_score"]))
            expected = 0.1
            
        xai = explainability.explain_prediction(
            "anomaly",
            is_anom,
            {
                "severity": severity,
                "value": val,
                "expected": expected
            },
            confidence=0.85
        )
        
        raw["confidence"] = xai["confidence"]
        raw["explanation"] = xai["explanation"]
        raw["feature_importance"] = xai["feature_importance"]
        enriched.append(raw)
        
    return enriched
