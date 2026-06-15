"""
Anomaly Detection
-----------------
Three types of anomalies detected from real data:
  1. Crime spikes  — District/month where FIR count deviates > 2.5 std from baseline
  2. Financial     — Transaction-level high velocity_score or geo_anomaly_score outliers
  3. District      — Multi-dimensional demographic-crime outliers via Isolation Forest
"""
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

try:
    import cache
    from backend.db import db_client
except ImportError:
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import cache
    from db import db_client

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
os.makedirs(MODEL_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# 1.  Crime-spike anomalies  (statistical z-score on monthly district counts)
# ─────────────────────────────────────────────────────────────────────────────

def detect_crime_spikes():
    """Returns districts/months where FIR counts spike > 2.5 sigma above their baseline."""
    query = """
        SELECT month, district_name,
               SUM(fir_count) AS monthly_firs
        FROM mv_monthly_trends
        GROUP BY month, district_name
        ORDER BY month ASC;
    """
    df = db_client.read_sql(query)

    if df.empty:
        return pd.DataFrame()

    df['month'] = pd.to_datetime(df['month'])
    df['monthly_firs'] = df['monthly_firs'].astype(float)

    # Per-district baseline stats
    stats = df.groupby('district_name')['monthly_firs'].agg(['mean', 'std']).reset_index()
    stats.columns = ['district_name', 'mean_firs', 'std_firs']
    stats['std_firs'] = stats['std_firs'].fillna(1.0).replace(0, 1.0)

    df = pd.merge(df, stats, on='district_name', how='left')
    df['z_score'] = (df['monthly_firs'] - df['mean_firs']) / df['std_firs']

    spikes = df[df['z_score'] > 2.5].copy()
    spikes['severity'] = pd.cut(
        spikes['z_score'],
        bins=[2.5, 3.5, 5.0, float('inf')],
        labels=['MEDIUM', 'HIGH', 'CRITICAL']
    )
    spikes = spikes.sort_values('z_score', ascending=False)

    return spikes[[
        'month', 'district_name', 'monthly_firs',
        'mean_firs', 'z_score', 'severity'
    ]].head(100)


# ─────────────────────────────────────────────────────────────────────────────
# 2.  Financial anomalies  (top velocity + geo-anomaly transactions)
# ─────────────────────────────────────────────────────────────────────────────

def detect_financial_anomalies():
    """Returns top anomalous transactions by velocity_score and geo_anomaly_score."""
    query = """
        SELECT
            transaction_id,
            timestamp,
            sender_account,
            receiver_account,
            amount,
            transaction_type,
            is_fraud,
            velocity_score,
            geo_anomaly_score,
            combined_score
        FROM mv_anomaly_financial;
    """
    df = db_client.read_sql(query)

    if df.empty:
        return pd.DataFrame()

    df['severity'] = pd.cut(
        df['combined_score'].astype(float),
        bins=[0, 5, 10, float('inf')],
        labels=['MEDIUM', 'HIGH', 'CRITICAL'],
        right=False
    ).fillna('MEDIUM')

    return df


# ─────────────────────────────────────────────────────────────────────────────
# 3.  District outlier model  (Isolation Forest on demographics + crime rates)
# ─────────────────────────────────────────────────────────────────────────────

def train_district_anomaly_model():
    """Trains an Isolation Forest on district-level multi-dimensional features."""
    query = """
        SELECT
            dp.district_name,
            dp.total_firs,
            dp.total_accused,
            dp.total_arrested,
            tc.total_convicted,
            dd.population_total,
            dd.literacy_rate,
            dd.facebook_wealth_index,
            dd.consumption_index
        FROM mv_district_profile dp
        LEFT JOIN (
            SELECT district_name, SUM(total_convicted) AS total_convicted
            FROM mv_monthly_trends
            GROUP BY district_name
        ) tc ON tc.district_name = dp.district_name
        LEFT JOIN dim_demographics dd
               ON dd.geo_id = 'DISTRICT_' || UPPER(dp.district_name);
    """
    df = db_client.read_sql(query)

    if df.empty:
        raise ValueError("No district profile data available.")

    # Calculate crime_rate_per_100k and handle missing values in Python
    df['total_convicted'] = df['total_convicted'].fillna(0)
    df['population_total'] = df['population_total'].fillna(2000000)
    df['literacy_rate'] = df['literacy_rate'].fillna(70.0)
    df['facebook_wealth_index'] = df['facebook_wealth_index'].fillna(0.0)
    df['consumption_index'] = df['consumption_index'].fillna(1.0)
    df['crime_rate_per_100k'] = (1e5 * df['total_firs'] / df['population_total']).round(2)

    features = [
        'total_firs', 'total_accused', 'total_arrested', 'total_convicted',
        'population_total', 'literacy_rate',
        'facebook_wealth_index', 'consumption_index',
        'crime_rate_per_100k'
    ]
    for col in features:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

    scaler = StandardScaler()
    X = scaler.fit_transform(df[features])

    clf = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
    clf.fit(X)

    scores = clf.decision_function(X)
    df['anomaly_score'] = scores
    df['is_anomaly'] = clf.predict(X) == -1

    model_payload = {
        "model":    clf,
        "scaler":   scaler,
        "features": features,
        "df":       df       # cached district data with anomaly labels
    }

    model_path = os.path.join(MODEL_DIR, "anomaly_district_model.joblib")
    joblib.dump(model_payload, model_path)

    n_anomalies = int(df['is_anomaly'].sum())
    print(f"District Anomaly Model Trained. {n_anomalies}/{len(df)} districts flagged as outliers.")
    return model_payload


# ─────────────────────────────────────────────────────────────────────────────
# Public API helpers (used by routes/ai.py at request time)
# ─────────────────────────────────────────────────────────────────────────────

def get_all_anomalies():
    """Returns a combined anomaly feed for the /api/v1/ai/anomalies endpoint."""
    cached = cache.get("all_anomalies")
    if cached is not None:
        return cached

    anomalies = []

    # Crime spikes
    spikes = detect_crime_spikes()
    if not spikes.empty:
        for _, row in spikes.iterrows():
            anomalies.append({
                "type": "crime_spike",
                "district": row["district_name"],
                "month": str(row["month"])[:7],
                "value": float(row["monthly_firs"]),
                "expected": float(row["mean_firs"]),
                "z_score": round(float(row["z_score"]), 2),
                "severity": str(row["severity"])
            })

    # Financial anomalies
    fin = detect_financial_anomalies()
    if not fin.empty:
        for _, row in fin.iterrows():
            anomalies.append({
                "type": "financial_anomaly",
                "transaction_id": str(row["transaction_id"]),
                "sender": str(row["sender_account"]),
                "receiver": str(row["receiver_account"]),
                "amount": float(row["amount"]),
                "velocity_score": float(row["velocity_score"]),
                "geo_anomaly_score": float(row["geo_anomaly_score"]),
                "is_fraud": bool(row["is_fraud"]),
                "severity": str(row["severity"])
            })

    # District outliers (from cached model)
    model_path = os.path.join(MODEL_DIR, "anomaly_district_model.joblib")
    if os.path.exists(model_path):
        payload = joblib.load(model_path)
        df = payload["df"]
        outliers = df[df["is_anomaly"]].copy()
        for _, row in outliers.iterrows():
            anomalies.append({
                "type": "district_outlier",
                "district": str(row["district_name"]),
                "anomaly_score": round(float(row["anomaly_score"]), 4),
                "crime_rate_per_100k": float(row.get("crime_rate_per_100k", 0)),
                "literacy_rate": float(row.get("literacy_rate", 0)),
                "severity": "HIGH" if row["anomaly_score"] < -0.15 else "MEDIUM"
            })

    # Sort by severity
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}
    anomalies.sort(key=lambda x: severity_order.get(x.get("severity", "MEDIUM"), 99))
    
    cache.set("all_anomalies", anomalies)
    return anomalies


if __name__ == "__main__":
    train_district_anomaly_model()
    spikes = detect_crime_spikes()
    print(f"Crime spikes detected: {len(spikes)}")
    fin = detect_financial_anomalies()
    print(f"Financial anomalies detected: {len(fin)}")
