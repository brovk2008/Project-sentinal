import os
import glob
import pandas as pd
import json

datasets = {
    "FIR_Details": "fir-details-karnataka-police/FIR_Details_Data.csv",
    "Financial_Fraud_Detection": "financial-transactions-dataset-for-fraud-detection/financial_fraud_detection_dataset.csv",
    "PaySim": "paysim1/PS_20174392719_1491204439457_log.csv",
    "Literacy_Data_2011": "india-literacy-data-district-wise/Literacy Data 2011.csv",
    "Vehicle_Registrations": "indian-vehicle-registration-data-202025/vehicle_registrations_500k.csv",
    "CDR_Data": "CDR-Generator/results/cdr_data.csv",
    "CDR_Situation1": "CDR-Generator/results/cdr_situation1.csv",
    "RBI_Directory": "SHRUG RBI/SHRUG RBI/data/rbi_directory_shrid.csv",
    "Facebook_RWI_Dist": "shrug-facebook-rwi-csv/facebook_rwi_pc11dist.csv",
    "VIIRS_Nightlights_Dist": "shrug-viirs-annual-csv/viirs_annual_pc11dist.csv",
    "SECC_Cons_Rural_Dist": "shrug-secc-cons-rural-csv/secc_cons_rural_pc11dist.csv",
    "Census_PCA_Dist": "pc11_pca_clean_pc11dist.csv"
}

results = []

for name, path in datasets.items():
    if not os.path.exists(path):
        print(f"Path does not exist: {path}")
        continue
    
    file_size_mb = os.path.getsize(path) / (1024 * 1024)
    print(f"Auditing {name} at {path} ({file_size_mb:.2f} MB)...")
    
    try:
        # For huge files, only read a subset for speed or load selectively
        if file_size_mb > 100:
            # Load first 100k rows to get columns and data types
            df_sample = pd.read_csv(path, nrows=100000)
            
            # Count total rows by reading in chunks or using system command (wc)
            total_rows = 0
            for chunk in pd.read_csv(path, chunksize=100000, usecols=[df_sample.columns[0]]):
                total_rows += len(chunk)
                
            cols = list(df_sample.columns)
            num_cols = len(cols)
            dtypes = {col: str(df_sample[col].dtype) for col in cols}
            
            # Estimate nulls from sample (or full scan of specific cols if needed, but sample is fast)
            null_pct = df_sample.isnull().mean().to_dict()
            
            # Estimate duplicates from sample
            dup_pct = df_sample.duplicated().mean()
        else:
            df = pd.read_csv(path)
            total_rows = len(df)
            cols = list(df.columns)
            num_cols = len(cols)
            dtypes = {col: str(df[col].dtype) for col in cols}
            null_pct = df.isnull().mean().to_dict()
            dup_pct = df.duplicated().mean()
            
        results.append({
            "name": name,
            "path": path,
            "size_mb": round(file_size_mb, 2),
            "rows": total_rows,
            "cols": num_cols,
            "column_names": cols,
            "dtypes": dtypes,
            "null_pct": {k: round(v * 100, 2) for k, v in null_pct.items()},
            "dup_pct": round(dup_pct * 100, 2)
        })
    except Exception as e:
        print(f"Error reading {name}: {e}")

with open("scripts/audit_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("Audit complete! Saved to scripts/audit_results.json")
