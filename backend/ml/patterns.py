"""
Repeat Crime Pattern Intelligence
----------------------------------
Clusters police stations and crime groups by behavioral patterns using real FIR attributes:
  - CrimeGroup_Name, CrimeHead_Name
  - Police Station (unit_id, unit_name)
  - District
  - Temporal patterns (year, month seasonality)
  - Arrest rates, Conviction rates

Pure aggregations from local SQLite sentinel_local.db.
"""
import os
import sqlite3
import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

N_CLUSTERS = 8  # 8 distinct crime pattern archetypes

def get_connection():
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sentinel_local.db")
    return sqlite3.connect(db_path)

def load_station_profiles():
    """Load station-level aggregate profiles from SQLite and calculate profiles in pandas."""
    conn = get_connection()
    
    # Fetch raw records to calculate modes and aggregates in Python to maintain DB portability
    query = """
        SELECT
            pu.unit_id,
            pu.unit_name,
            pu.district_name,
            pu.latitude,
            pu.longitude,
            f.accused_count,
            f.arrested_count,
            f.conviction_count,
            f.fir_date,
            cc.crime_group_name,
            f.crime_class_id
        FROM fact_fir_events f
        JOIN dim_police_units pu ON f.unit_id = pu.unit_id
        JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id;
    """
    df = pd.read_sql(query, conn)
    conn.close()
    
    if df.empty:
        return pd.DataFrame()
        
    df['fir_date'] = pd.to_datetime(df['fir_date'])
    df['month'] = df['fir_date'].dt.month
    # 0 = Monday, 6 = Sunday in pandas. We want weekend (Saturday=5, Sunday=6)
    df['is_weekend'] = df['fir_date'].dt.dayofweek.isin([5, 6]).astype(float)
    
    # Calculate aggregates
    gps = df.groupby(['unit_id', 'unit_name', 'district_name', 'latitude', 'longitude'])
    
    stations = []
    for (unit_id, name, dist, lat, lng), group in gps:
        total_firs = len(group)
        unique_crimes = group['crime_class_id'].nunique()
        total_acc = group['accused_count'].sum()
        total_arr = group['arrested_count'].sum()
        total_conv = group['conviction_count'].sum()
        
        arr_rate = round(100.0 * total_arr / total_acc, 2) if total_acc > 0 else 0.0
        conv_rate = round(100.0 * total_conv / total_arr, 2) if total_arr > 0 else 0.0
        
        # Mode peak month
        peak_m = group['month'].mode()[0] if not group['month'].empty else 1
        # Weekend ratio
        wk_ratio = group['is_weekend'].mean()
        # Top crime group mode
        top_group = group['crime_group_name'].mode()[0] if not group['crime_group_name'].empty else "Unknown"
        
        stations.append({
            "unit_id": unit_id,
            "unit_name": name,
            "district_name": dist,
            "latitude": lat if lat is not None else 12.9716,
            "longitude": lng if lng is not None else 77.5946,
            "total_firs": total_firs,
            "unique_crime_types": unique_crimes,
            "total_accused": total_acc,
            "total_arrested": total_arr,
            "total_convicted": total_conv,
            "arrest_rate": arr_rate,
            "conviction_rate": conv_rate,
            "peak_month": peak_m,
            "weekend_ratio": wk_ratio,
            "top_crime_group": top_group
        })
        
    res_df = pd.DataFrame(stations)
    if not res_df.empty:
        res_df = res_df.sort_values("total_firs", ascending=False)
    return res_df

def load_crime_group_profiles():
    """Aggregate each crime group's temporal and outcome characteristics."""
    conn = get_connection()
    query = """
        SELECT
            cc.crime_group_name,
            f.accused_count,
            f.victim_count,
            f.arrested_count,
            f.conviction_count,
            f.fir_date,
            pu.district_name
        FROM fact_fir_events f
        JOIN dim_crime_classification cc ON f.crime_class_id = cc.crime_class_id
        JOIN dim_police_units pu ON f.unit_id = pu.unit_id;
    """
    df = pd.read_sql(query, conn)
    conn.close()
    
    if df.empty:
        return pd.DataFrame()
        
    df['fir_date'] = pd.to_datetime(df['fir_date'])
    df['month'] = df['fir_date'].dt.month
    df['is_weekend'] = df['fir_date'].dt.dayofweek.isin([5, 6]).astype(float)
    
    gps = df.groupby('crime_group_name')
    crime_groups = []
    
    for name, group in gps:
        total_firs = len(group)
        
        # Quarters
        q1 = group['month'].between(1, 3).sum()
        q2 = group['month'].between(4, 6).sum()
        q3 = group['month'].between(7, 9).sum()
        q4 = group['month'].between(10, 12).sum()
        
        total_acc = group['accused_count'].sum()
        total_arr = group['arrested_count'].sum()
        total_conv = group['conviction_count'].sum()
        
        arr_rate = round(100.0 * total_arr / total_acc, 2) if total_acc > 0 else 0.0
        conv_rate = round(100.0 * total_conv / total_arr, 2) if total_arr > 0 else 0.0
        
        avg_acc = group['accused_count'].mean()
        avg_vic = group['victim_count'].mean()
        dist_spread = group['district_name'].nunique()
        wk_ratio = group['is_weekend'].mean()
        
        crime_groups.append({
            "crime_group_name": name,
            "total_firs": total_firs,
            "q1_firs": q1,
            "q2_firs": q2,
            "q3_firs": q3,
            "q4_firs": q4,
            "arrest_rate": arr_rate,
            "conviction_rate": conv_rate,
            "avg_accused_per_fir": avg_acc,
            "avg_victims_per_fir": avg_vic,
            "district_spread": dist_spread,
            "weekend_ratio": wk_ratio
        })
        
    res_df = pd.DataFrame(crime_groups)
    if not res_df.empty:
        res_df = res_df.sort_values("total_firs", ascending=False)
    return res_df

def train_and_evaluate():
    # Station-level clustering
    station_df = load_station_profiles()
    if station_df.empty:
        raise ValueError("No station profile data available.")

    station_features = [
        'total_firs', 'unique_crime_types',
        'arrest_rate', 'conviction_rate',
        'peak_month', 'weekend_ratio',
        'latitude', 'longitude'
    ]
    for col in station_features:
        station_df[col] = pd.to_numeric(station_df[col], errors='coerce').fillna(0.0)

    X_station = station_df[station_features].copy()
    scaler_station = StandardScaler()
    X_scaled_station = scaler_station.fit_transform(X_station)

    # Validate optimal K for Stations using Silhouette and Elbow analysis
    from sklearn.metrics import silhouette_score
    best_k_station = 2
    best_sil_station = -1.0
    station_silhouettes = {}
    station_inertias = {}
    
    k_range_station = range(2, min(12, len(station_df)))
    for k in k_range_station:
        km = KMeans(n_clusters=k, random_state=42, n_init=5)
        labels = km.fit_predict(X_scaled_station)
        sil = float(silhouette_score(X_scaled_station, labels))
        station_silhouettes[k] = sil
        station_inertias[k] = float(km.inertia_)
        if sil > best_sil_station:
            best_sil_station = sil
            best_k_station = k
            
    print(f"\n[Validation] Optimal K for Station Clustering by Silhouette: {best_k_station} (score: {best_sil_station:.4f})")

    n_clusters_station = best_k_station
    kmeans_station = KMeans(n_clusters=n_clusters_station, random_state=42, n_init=10)
    station_df['cluster'] = kmeans_station.fit_predict(X_scaled_station)
    inertia_station = float(kmeans_station.inertia_)

    # Crime-group-level clustering
    crime_df = load_crime_group_profiles()
    if crime_df.empty:
        raise ValueError("No crime group profile data available.")

    crime_features = [
        'total_firs', 'q1_firs', 'q2_firs', 'q3_firs', 'q4_firs',
        'arrest_rate', 'conviction_rate',
        'avg_accused_per_fir', 'avg_victims_per_fir',
        'district_spread', 'weekend_ratio'
    ]
    for col in crime_features:
        crime_df[col] = pd.to_numeric(crime_df[col], errors='coerce').fillna(0.0)

    X_crime = crime_df[crime_features].copy()
    scaler_crime = StandardScaler()
    X_scaled_crime = scaler_crime.fit_transform(X_crime)

    # Validate optimal K for Crime Groups using Silhouette and Elbow analysis
    best_k_crime = 2
    best_sil_crime = -1.0
    crime_silhouettes = {}
    crime_inertias = {}
    
    k_range_crime = range(2, min(12, len(crime_df)))
    for k in k_range_crime:
        km = KMeans(n_clusters=k, random_state=42, n_init=5)
        labels = km.fit_predict(X_scaled_crime)
        sil = float(silhouette_score(X_scaled_crime, labels))
        crime_silhouettes[k] = sil
        crime_inertias[k] = float(km.inertia_)
        if sil > best_sil_crime:
            best_sil_crime = sil
            best_k_crime = k
            
    print(f"[Validation] Optimal K for Crime Group Clustering by Silhouette: {best_k_crime} (score: {best_sil_crime:.4f})\n")

    n_clusters_crime = best_k_crime
    kmeans_crime = KMeans(n_clusters=n_clusters_crime, random_state=42, n_init=10)
    crime_df['cluster'] = kmeans_crime.fit_predict(X_scaled_crime)
    inertia_crime = float(kmeans_crime.inertia_)

    # Build dynamic, statistics-derived cluster labels
    cluster_labels = {}
    g_firs = station_df['total_firs'].mean()
    g_arr = station_df['arrest_rate'].mean()
    g_conv = station_df['conviction_rate'].mean()
    g_week = station_df['weekend_ratio'].mean()

    for c in range(n_clusters_station):
        s_subset = station_df[station_df['cluster'] == c]
        
        prefix = "Medium-Volume"
        suffix = "Standard Ops"
        
        if not s_subset.empty:
            mean_firs = s_subset['total_firs'].mean()
            mean_arr = s_subset['arrest_rate'].mean()
            mean_conv = s_subset['conviction_rate'].mean()
            mean_week = s_subset['weekend_ratio'].mean()
            
            if mean_firs > g_firs * 1.5:
                prefix = "High-Volume"
            elif mean_firs < g_firs * 0.5:
                prefix = "Low-Activity"
            else:
                prefix = "Medium-Volume"
                
            if mean_arr > g_arr + 8.0:
                suffix = "High-Arrest"
            elif mean_conv > g_conv + 8.0:
                suffix = "High-Conviction"
            elif mean_week > g_week + 0.05:
                suffix = "Weekend-Spike"
            else:
                suffix = "General Intel"
        
        cluster_labels[c] = f"{prefix} {suffix}"

    station_df['cluster_label'] = station_df['cluster'].map(cluster_labels)
    crime_df['cluster_label'] = crime_df['cluster'].map(cluster_labels)

    # Save everything
    model_payload = {
        "kmeans_station":  kmeans_station,
        "scaler_station":  scaler_station,
        "station_features": station_features,
        "kmeans_crime":    kmeans_crime,
        "scaler_crime":    scaler_crime,
        "crime_features":  crime_features,
        "station_df":      station_df,     # cached for fast API responses
        "crime_df":        crime_df,
        "cluster_labels":  cluster_labels,
        "metrics": {
            "station_inertia": inertia_station,
            "crime_inertia":   inertia_crime,
            "station_clusters": n_clusters_station,
            "crime_clusters":   n_clusters_crime,
            "station_rows":    int(len(station_df)),
            "crime_group_rows": int(len(crime_df))
        }
    }

    model_path = os.path.join(MODEL_DIR, "patterns_model.joblib")
    joblib.dump(model_payload, model_path)

    print(
        f"Crime Patterns Model Trained.\n"
        f"  Stations: {len(station_df)} rows -> {n_clusters_station} clusters (inertia: {inertia_station:.1f})\n"
        f"  Crime groups: {len(crime_df)} rows -> {n_clusters_crime} clusters (inertia: {inertia_crime:.1f})"
    )
    return model_payload

if __name__ == "__main__":
    train_and_evaluate()
