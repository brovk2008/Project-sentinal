import os
import sqlite3
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_squared_error

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

def load_data():
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sentinel_local.db")
    conn = sqlite3.connect(db_path)
    query = """
        SELECT
            t.month,
            t.district_name,
            t.crime_group_name,
            t.fir_count,
            d.population_total,
            d.literacy_rate,
            d.facebook_wealth_index,
            d.consumption_index
        FROM mv_monthly_trends t
        LEFT JOIN dim_demographics d ON d.geo_id = 'DISTRICT_' || UPPER(t.district_name)
        ORDER BY t.month ASC, t.district_name, t.crime_group_name;
    """
    df = pd.read_sql(query, conn)
    conn.close()
    
    # Cast dates and numbers
    df['month'] = pd.to_datetime(df['month'])
    df['fir_count'] = df['fir_count'].astype(float)
    df['population_total'] = df['population_total'].fillna(df['population_total'].mean() if not df['population_total'].isna().all() else 1000000).astype(float)
    df['literacy_rate'] = df['literacy_rate'].fillna(df['literacy_rate'].mean() if not df['literacy_rate'].isna().all() else 70.0).astype(float)
    df['facebook_wealth_index'] = df['facebook_wealth_index'].fillna(0.0).astype(float)
    df['consumption_index'] = df['consumption_index'].fillna(1.0).astype(float)
    return df

def engineer_features(df):
    # Get complete grid of months, districts, and crime groups to prevent temporal gaps
    months = df['month'].unique()
    districts = df['district_name'].unique()
    crime_groups = df['crime_group_name'].unique()
    
    grid = pd.MultiIndex.from_product(
        [months, districts, crime_groups], 
        names=['month', 'district_name', 'crime_group_name']
    ).to_frame().reset_index(drop=True)
    
    # Static district features mapping for re-merging
    demographics = df[['district_name', 'population_total', 'literacy_rate', 'facebook_wealth_index', 'consumption_index']].drop_duplicates('district_name')
    
    df_grid = pd.merge(grid, df[['month', 'district_name', 'crime_group_name', 'fir_count']], on=['month', 'district_name', 'crime_group_name'], how='left')
    df_grid['fir_count'] = df_grid['fir_count'].fillna(0.0)
    
    # Re-merge demographics
    df_grid = pd.merge(df_grid, demographics, on='district_name', how='left')
    
    # Fill any empty demographics
    df_grid['population_total'] = df_grid['population_total'].fillna(df_grid['population_total'].mean() if not df_grid['population_total'].isna().all() else 1000000)
    df_grid['literacy_rate'] = df_grid['literacy_rate'].fillna(df_grid['literacy_rate'].mean() if not df_grid['literacy_rate'].isna().all() else 70.0)
    df_grid['facebook_wealth_index'] = df_grid['facebook_wealth_index'].fillna(0.0)
    df_grid['consumption_index'] = df_grid['consumption_index'].fillna(1.0)
    
    # Sort and compute lag features
    df_grid = df_grid.sort_values(['district_name', 'crime_group_name', 'month'])
    
    df_grid['lag_1'] = df_grid.groupby(['district_name', 'crime_group_name'])['fir_count'].shift(1)
    df_grid['lag_2'] = df_grid.groupby(['district_name', 'crime_group_name'])['fir_count'].shift(2)
    df_grid['lag_3'] = df_grid.groupby(['district_name', 'crime_group_name'])['fir_count'].shift(3)
    df_grid['rolling_mean_3'] = df_grid.groupby(['district_name', 'crime_group_name'])['lag_1'].transform(lambda x: x.rolling(3, min_periods=1).mean())
    
    # Fill lags with 0
    df_grid['lag_1'] = df_grid['lag_1'].fillna(0.0)
    df_grid['lag_2'] = df_grid['lag_2'].fillna(0.0)
    df_grid['lag_3'] = df_grid['lag_3'].fillna(0.0)
    df_grid['rolling_mean_3'] = df_grid['rolling_mean_3'].fillna(0.0)
    
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
        raise ValueError("No monthly trend data available in PostgreSQL.")
        
    df_feat = engineer_features(df)
    
    # Categorical encoding
    le_district = LabelEncoder()
    df_feat['district_code'] = le_district.fit_transform(df_feat['district_name'])
    
    le_crime = LabelEncoder()
    df_feat['crime_code'] = le_crime.fit_transform(df_feat['crime_group_name'])
    
    features = [
        'district_code', 'crime_code', 'month_val',
        'population_total', 'literacy_rate', 'facebook_wealth_index', 'consumption_index',
        'lag_1', 'lag_2', 'lag_3', 'rolling_mean_3'
    ]
    
    # Time-based split: Validation set = last 6 months
    max_month = df_feat['month'].max()
    split_date = max_month - pd.DateOffset(months=6)
    
    train_df = df_feat[df_feat['month'] < split_date]
    val_df = df_feat[df_feat['month'] >= split_date]
    
    if val_df.empty:
        # Fallback to 80/20 split if data is too short
        train_df = df_feat.iloc[:int(len(df_feat)*0.8)]
        val_df = df_feat.iloc[int(len(df_feat)*0.8):]
        
    X_train, y_train = train_df[features], train_df['fir_count']
    X_val, y_val = val_df[features], val_df['fir_count']
    
    # Initialize models
    rf = RandomForestRegressor(n_estimators=50, max_depth=10, random_state=42, n_jobs=-1)
    
    # Train
    rf.fit(X_train, y_train)
    
    # Predict
    rf_pred = rf.predict(X_val)
    
    # Evaluate RMSE
    rf_rmse = np.sqrt(mean_squared_error(y_val, rf_pred))
    
    metrics = {
        "RandomForest": {"rmse": float(rf_rmse)}
    }
    
    chosen_model_name = "RandomForest"
    chosen_model = rf
    chosen_rmse = rf_rmse
        
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
    
    # Save selected model and encoders
    model_payload = {
        "model": chosen_model,
        "features": features,
        "le_district": le_district,
        "le_crime": le_crime,
        "chosen_model_name": chosen_model_name,
        "metrics": metrics,
        "feature_importances": feat_imp,
        "rmse": chosen_rmse,
        # Save standard deviation of residuals for confidence scoring
        "std_residuals": float(np.std(y_val - chosen_model.predict(X_val)))
    }
    
    model_path = os.path.join(MODEL_DIR, "forecast_model.joblib")
    joblib.dump(model_payload, model_path)
    
    print(f"Forecasting Model Trained. Chosen: {chosen_model_name} (RMSE: {chosen_rmse:.4f})")
    return model_payload

if __name__ == "__main__":
    train_and_evaluate()
