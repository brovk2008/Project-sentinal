import os
import sqlite3
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import f1_score

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

def load_data():
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sentinel_local.db")
    conn = sqlite3.connect(db_path)
    query = """
        SELECT
            strftime('%Y-%m-01', f.fir_date) AS month,
            f.unit_id,
            pu.unit_name,
            pu.district_name,
            COALESCE(
                pu.latitude, 
                (SELECT dc.latitude FROM district_centroids dc WHERE UPPER(dc.district_name) = UPPER(
                    CASE pu.district_name
                        WHEN 'Bengaluru City' THEN 'Bangalore'
                        WHEN 'Bengaluru Dist' THEN 'Bangalore Rural'
                        WHEN 'Mysuru City' THEN 'Mysore'
                        WHEN 'Mysuru Dist' THEN 'Mysore'
                        WHEN 'Mangaluru City' THEN 'Dakshina Kannada'
                        WHEN 'Belagavi City' THEN 'Belgaum'
                        WHEN 'Belagavi Dist' THEN 'Belgaum'
                        WHEN 'Kalaburagi City' THEN 'Gulbarga'
                        WHEN 'Kalaburagi' THEN 'Gulbarga'
                        WHEN 'Ballari' THEN 'Bellary'
                        WHEN 'Vijayanagara' THEN 'Bellary'
                        WHEN 'Tumakuru' THEN 'Tumkur'
                        WHEN 'Shivamogga' THEN 'Shimoga'
                        WHEN 'Chickballapura' THEN 'Chikkaballapura'
                        WHEN 'Chikkamagaluru' THEN 'Chikmagalur'
                        WHEN 'Vijayapur' THEN 'Bijapur'
                        WHEN 'Hubballi Dharwad City' THEN 'Dharwad'
                        WHEN 'Karnataka Railways' THEN 'Bangalore'
                        WHEN 'K.G.F' THEN 'Kolar'
                        WHEN 'CID' THEN 'Bangalore'
                        WHEN 'Coastal Security Police' THEN 'Udupi'
                        WHEN 'ISD Bengaluru' THEN 'Bangalore'
                        ELSE pu.district_name
                    END
                ))
            ) AS latitude,
            COALESCE(
                pu.longitude, 
                (SELECT dc.longitude FROM district_centroids dc WHERE UPPER(dc.district_name) = UPPER(
                    CASE pu.district_name
                        WHEN 'Bengaluru City' THEN 'Bangalore'
                        WHEN 'Bengaluru Dist' THEN 'Bangalore Rural'
                        WHEN 'Mysuru City' THEN 'Mysore'
                        WHEN 'Mysuru Dist' THEN 'Mysore'
                        WHEN 'Mangaluru City' THEN 'Dakshina Kannada'
                        WHEN 'Belagavi City' THEN 'Belgaum'
                        WHEN 'Belagavi Dist' THEN 'Belgaum'
                        WHEN 'Kalaburagi City' THEN 'Gulbarga'
                        WHEN 'Kalaburagi' THEN 'Gulbarga'
                        WHEN 'Ballari' THEN 'Bellary'
                        WHEN 'Vijayanagara' THEN 'Bellary'
                        WHEN 'Tumakuru' THEN 'Tumkur'
                        WHEN 'Shivamogga' THEN 'Shimoga'
                        WHEN 'Chickballapura' THEN 'Chikkaballapura'
                        WHEN 'Chikkamagaluru' THEN 'Chikmagalur'
                        WHEN 'Vijayapur' THEN 'Bijapur'
                        WHEN 'Hubballi Dharwad City' THEN 'Dharwad'
                        WHEN 'Karnataka Railways' THEN 'Bangalore'
                        WHEN 'K.G.F' THEN 'Kolar'
                        WHEN 'CID' THEN 'Bangalore'
                        WHEN 'Coastal Security Police' THEN 'Udupi'
                        WHEN 'ISD Bengaluru' THEN 'Bangalore'
                        ELSE pu.district_name
                    END
                ))
            ) AS longitude,
            COUNT(*) AS fir_count
        FROM fact_fir_events f
        JOIN dim_police_units pu ON f.unit_id = pu.unit_id
        GROUP BY month, f.unit_id, pu.unit_name, pu.district_name, pu.latitude, pu.longitude
        ORDER BY month ASC, f.unit_id;
    """
    df = pd.read_sql(query, conn)
    # Filter out records where both coordinates couldn't be resolved
    df = df.dropna(subset=['latitude', 'longitude'])
    conn.close()
    
    df['month'] = pd.to_datetime(df['month'])
    df['fir_count'] = df['fir_count'].astype(float)
    df['latitude'] = df['latitude'].astype(float)
    df['longitude'] = df['longitude'].astype(float)
    return df

def engineer_features(df):
    # Get complete grid of months and active police units
    months = df['month'].unique()
    units = df['unit_id'].unique()
    
    grid = pd.MultiIndex.from_product(
        [months, units], 
        names=['month', 'unit_id']
    ).to_frame().reset_index(drop=True)
    
    # Static station details mapping
    station_meta = df[['unit_id', 'unit_name', 'district_name', 'latitude', 'longitude']].drop_duplicates('unit_id')
    
    df_grid = pd.merge(grid, df[['month', 'unit_id', 'fir_count']], on=['month', 'unit_id'], how='left')
    df_grid['fir_count'] = df_grid['fir_count'].fillna(0.0)
    
    df_grid = pd.merge(df_grid, station_meta, on='unit_id', how='left')
    
    # Sort and compute lag features
    df_grid = df_grid.sort_values(['unit_id', 'month'])
    
    df_grid['lag_1'] = df_grid.groupby('unit_id')['fir_count'].shift(1).fillna(0.0)
    df_grid['lag_2'] = df_grid.groupby('unit_id')['fir_count'].shift(2).fillna(0.0)
    df_grid['lag_3'] = df_grid.groupby('unit_id')['fir_count'].shift(3).fillna(0.0)
    
    # Rolling 3 month mean of previous counts
    df_grid['mean_3'] = df_grid.groupby('unit_id')['lag_1'].transform(lambda x: x.rolling(3, min_periods=1).mean()).fillna(0.0)
    
    # Target: Crime Spike (>20% increase in next month vs rolling 3-month mean, AND at least 5 crimes to filter out small numbers noise)
    df_grid['next_fir_count'] = df_grid.groupby('unit_id')['fir_count'].shift(-1)
    
    # If next_fir_count is NaN, drop it (cannot evaluate target for the very last month)
    df_grid = df_grid.dropna(subset=['next_fir_count'])
    
    df_grid['is_spike'] = (
        (df_grid['next_fir_count'] > 1.2 * df_grid['mean_3']) & 
        (df_grid['next_fir_count'] > 5)
    ).astype(int)
    
    # Temporal features
    df_grid['month_val'] = df_grid['month'].dt.month
    
    # Drop first 3 months where lags are not fully formed
    min_month = df_grid['month'].min()
    start_train_month = min_month + pd.DateOffset(months=3)
    df_grid = df_grid[df_grid['month'] >= start_train_month]
    
    return df_grid

def train_and_evaluate():
    df = load_data()
    if df.empty:
        raise ValueError("No hotspot data available in PostgreSQL.")
        
    df_feat = engineer_features(df)
    
    # Label encode district names
    le_district = LabelEncoder()
    df_feat['district_code'] = le_district.fit_transform(df_feat['district_name'])
    
    features = [
        'district_code', 'latitude', 'longitude', 'month_val',
        'fir_count', 'lag_1', 'lag_2', 'lag_3', 'mean_3'
    ]
    
    # Split into train/validation based on time
    max_month = df_feat['month'].max()
    split_date = max_month - pd.DateOffset(months=6)
    
    train_df = df_feat[df_feat['month'] < split_date]
    val_df = df_feat[df_feat['month'] >= split_date]
    
    if val_df.empty:
        train_df = df_feat.iloc[:int(len(df_feat)*0.8)]
        val_df = df_feat.iloc[int(len(df_feat)*0.8):]
        
    X_train, y_train = train_df[features], train_df['is_spike']
    X_val, y_val = val_df[features], val_df['is_spike']
    
    # Initialize classifiers
    rf = RandomForestClassifier(n_estimators=50, max_depth=10, random_state=42, n_jobs=-1)
    
    # Train
    rf.fit(X_train, y_train)
    
    # Predict
    rf_pred = rf.predict(X_val)
    
    # Evaluate F1-score
    rf_f1 = f1_score(y_val, rf_pred, zero_division=0)
    
    metrics = {
        "RandomForest": {"f1": float(rf_f1)}
    }
    
    chosen_model_name = "RandomForest"
    chosen_model = rf
    chosen_f1 = rf_f1
        
    # Feature importances
    if hasattr(chosen_model, "feature_importances_"):
        importances = chosen_model.feature_importances_
    else:
        importances = np.zeros(len(features))
        
    feat_imp = sorted(
        [{"feature": f, "importance": float(imp)} for f, imp in zip(features, importances)],
        key=lambda x: x["importance"],
        reverse=True
    )
    
    model_payload = {
        "model": chosen_model,
        "features": features,
        "le_district": le_district,
        "chosen_model_name": chosen_model_name,
        "metrics": metrics,
        "feature_importances": feat_imp,
        "f1": chosen_f1
    }
    
    model_path = os.path.join(MODEL_DIR, "hotspot_model.joblib")
    joblib.dump(model_payload, model_path)
    
    print(f"Hotspot Model Trained. Chosen: {chosen_model_name} (F1: {chosen_f1:.4f})")
    return model_payload

if __name__ == "__main__":
    train_and_evaluate()
