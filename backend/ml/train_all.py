"""
train_all.py - Master training orchestrator for Project Sentinel Phase 3
Runs all ML pipelines in order, prints benchmarks, and saves models + metrics.
Usage:
    python backend/ml/train_all.py
"""
import os
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import sys
import json
import time

# Ensure backend/ is on the path so we can import ml.*
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

# Load environment from app-config.json if not present in environment
if "DATABASE_URL" not in os.environ:
    try:
        config_path = os.path.join(BACKEND_DIR, "app-config.json")
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                config_data = json.load(f)
                env_vars = config_data.get("env_variables", {})
                for k, v in env_vars.items():
                    if k not in os.environ:
                        os.environ[k] = str(v)
            print("Loaded environment variables from app-config.json")
    except Exception as e:
        print(f"Warning: could not load app-config.json: {e}")


from ml import forecasting, hotspot, network_risk, patterns, anomaly

MODEL_DIR = os.path.join(BACKEND_DIR, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

METRICS_PATH = os.path.join(MODEL_DIR, "metrics.json")

def banner(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

def run_all():
    all_metrics = {}

    # -- 1. Crime Forecasting --------------------------------------
    banner("1 / 5  Crime Risk Forecasting")
    t0 = time.time()
    payload = forecasting.train_and_evaluate()
    elapsed = time.time() - t0
    all_metrics["forecasting"] = {
        **payload["metrics"],
        "chosen_model": payload["chosen_model_name"],
        "chosen_rmse":  round(payload["rmse"], 4),
        "std_residuals": round(payload["std_residuals"], 4),
        "training_time_s": round(elapsed, 1)
    }
    print(f"  OK Done in {elapsed:.1f}s")

    # -- 2. Hotspot Prediction -------------------------------------
    banner("2 / 5  Crime Hotspot Prediction")
    t0 = time.time()
    payload = hotspot.train_and_evaluate()
    elapsed = time.time() - t0
    all_metrics["hotspot"] = {
        **payload["metrics"],
        "chosen_model": payload["chosen_model_name"],
        "chosen_f1":    round(payload["f1"], 4),
        "training_time_s": round(elapsed, 1)
    }
    print(f"  OK Done in {elapsed:.1f}s")

    # -- 3. Financial Network Risk ---------------------------------
    banner("3 / 5  Financial Network Risk")
    t0 = time.time()
    payload = network_risk.train_network_model()
    elapsed = time.time() - t0
    all_metrics["network_risk"] = {
        "model": "IsolationForest",
        "min_decision_score": round(payload["min_score"], 4),
        "max_decision_score": round(payload["max_score"], 4),
        "training_time_s": round(elapsed, 1)
    }
    print(f"  OK Done in {elapsed:.1f}s")

    # -- 4. Repeat Crime Pattern Intelligence ---------------------
    banner("4 / 5  Repeat Crime Pattern Intelligence")
    t0 = time.time()
    payload = patterns.train_and_evaluate()
    elapsed = time.time() - t0
    all_metrics["patterns"] = {
        **payload["metrics"],
        "algorithm": "KMeans",
        "training_time_s": round(elapsed, 1)
    }
    print(f"  OK Done in {elapsed:.1f}s")

    # -- 5. Anomaly Detection --------------------------------------
    banner("5 / 5  Anomaly Detection")
    t0 = time.time()
    payload = anomaly.train_district_anomaly_model()
    # Count real spikes and financial anomalies
    spikes = anomaly.detect_crime_spikes()
    fin    = anomaly.detect_financial_anomalies()
    elapsed = time.time() - t0
    all_metrics["anomaly"] = {
        "district_model": "IsolationForest",
        "crime_spikes_detected": int(len(spikes)),
        "financial_anomalies_detected": int(len(fin)),
        "district_outliers": int(payload["df"]["is_anomaly"].sum()),
        "training_time_s": round(elapsed, 1)
    }
    print(f"  OK Done in {elapsed:.1f}s")

    # -- Save metrics.json -----------------------------------------
    with open(METRICS_PATH, "w") as f:
        json.dump(all_metrics, f, indent=2)

    banner("PHASE 3 TRAINING COMPLETE")
    print(f"\n  Models saved to: {MODEL_DIR}")
    print(f"  Metrics saved to: {METRICS_PATH}")

    sep = "+" + "-" * 54 + "+"
    print("\n" + sep)
    print("  MODEL BENCHMARK SUMMARY")
    print(sep)
    fc = all_metrics['forecasting']
    hs = all_metrics['hotspot']
    pt = all_metrics['patterns']
    an = all_metrics['anomaly']
    print(f"  Forecasting  | {fc['chosen_model']:<14} | RMSE {fc['chosen_rmse']:.4f}")
    print(f"  Hotspot      | {hs['chosen_model']:<14} | F1   {hs['chosen_f1']:.4f}")
    print(f"  Network Risk | {'IsolationForest':<14} | anomaly bounds logged")
    print(f"  Patterns     | {'KMeans':<14} | {pt['station_clusters']} station + {pt['crime_clusters']} crime clusters")
    print(f"  Anomaly      | {'IsoForest+z-score':<14} | {an['crime_spikes_detected']} spikes, {an['district_outliers']} outlier districts")
    print(sep + "\n")

    return all_metrics

if __name__ == "__main__":
    run_all()
