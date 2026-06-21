import os
import joblib
import numpy as np
import pandas as pd
import networkx as nx
from sklearn.ensemble import IsolationForest

try:
    from backend.db import db_client
except ImportError:
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from db import db_client

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

def train_network_model():
    """
    Trains an Isolation Forest on a representative sample of account transaction aggregates
    to identify outlier behaviors (mule accounts, laundering structures).
    """
    query = """
        SELECT
            sender_account AS account_number,
            SUM(amount) AS total_amount,
            AVG(amount) AS avg_amount,
            MAX(amount) AS max_amount,
            COUNT(*) AS tx_count,
            AVG(velocity_score) AS velocity_mean,
            AVG(geo_anomaly_score) AS geo_anomaly_mean
        FROM fact_financial_transactions
        GROUP BY sender_account;
    """
    # Fetch all, applying limit in Python if needed or query handles it
    df = db_client.read_sql(query)
    if not df.empty:
        df = df.head(20000)
    
    if df.empty:
        raise ValueError("No financial transactions available for training.")
        
    features = ['total_amount', 'avg_amount', 'max_amount', 'tx_count', 'velocity_mean', 'geo_anomaly_mean']
    for col in features:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
    X = df[features]
    
    # Train Isolation Forest
    clf = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
    clf.fit(X)
    
    # Calculate bounds of decision function for normalization
    scores = clf.decision_function(X)
    min_score = float(np.min(scores))
    max_score = float(np.max(scores))
    
    model_payload = {
        "model": clf,
        "features": features,
        "min_score": min_score,
        "max_score": max_score,
        "means": df[features].mean().to_dict(),
        "stds": df[features].std().replace(0, 1.0).to_dict()
    }
    
    model_path = os.path.join(MODEL_DIR, "network_anomaly_model.joblib")
    joblib.dump(model_payload, model_path)
    
    print(f"Financial Network Model Trained. Anomaly Score Bounds: [{min_score:.4f}, {max_score:.4f}]")
    return model_payload

def analyze_account_network(account_number, max_nodes=300, max_edges=1000):
    """
    Given an account number, fetches its 2-hop transaction network, builds a NetworkX graph,
    detects cycles, calculates network metrics, and scores it using the trained Isolation Forest.
    """
    # Step 1: Query 1-hop transactions
    query1 = """
        SELECT sender_account, receiver_account, amount, is_fraud, velocity_score, geo_anomaly_score, timestamp
        FROM fact_financial_transactions
        WHERE sender_account = :account OR receiver_account = :account;
    """
    res1 = db_client.execute(query1, {"account": account_number}).fetchall()
    
    if not res1:
        return {
            "account_number": account_number,
            "risk_score": 0.0,
            "nodes": [{"id": account_number, "label": account_number, "risk": 0}],
            "edges": [],
            "metrics": {"cycles_count": 0, "in_degree": 0, "out_degree": 0, "velocity": 0.0, "fraud_neighbors": 0}
        }
        
    # Get all unique accounts from 1-hop
    accounts = set()
    for row in res1:
        accounts.add(row[0])
        accounts.add(row[1])
        
    # Limit nodes size to avoid massive graph memory footprint
    accounts_list = list(accounts)[:max_nodes]
    
    # Step 2: Fetch all transactions between these 1-hop accounts (2-hop network)
    param_dict = {}
    placeholders_list = []
    for idx, val in enumerate(accounts_list):
        param_key = f"acc{idx}"
        placeholders_list.append(f":{param_key}")
        param_dict[param_key] = val
    accounts_str = ", ".join(placeholders_list)
    query2 = f"""
        SELECT sender_account, receiver_account, amount, is_fraud, velocity_score, geo_anomaly_score, timestamp
        FROM fact_financial_transactions
        WHERE sender_account IN ({accounts_str})
          AND receiver_account IN ({accounts_str});
    """
    rows = db_client.execute(query2, param_dict).fetchall()
    
    # Build NetworkX graph
    G = nx.DiGraph()
    edges_list = []
    fraud_neighbors = set()
    total_amount = 0.0
    tx_count = 0
    velocities = []
    geo_anoms = []
    amounts = []
    
    # Limit to max_edges
    for row in rows[:max_edges]:
        sender = row[0]
        receiver = row[1]
        amount = row[2]
        is_fraud = row[3]
        velocity = row[4]
        geo_anomaly = row[5]
        
        amount_f = float(amount or 0.0)
        velocity_f = float(velocity or 0.0)
        geo_f = float(geo_anomaly or 0.0)
        is_fraud_b = bool(is_fraud)
        
        G.add_edge(sender, receiver, amount=amount_f, is_fraud=is_fraud_b)
        edges_list.append({
            "from": sender,
            "to": receiver,
            "amount": amount_f,
            "is_fraud": is_fraud_b
        })
        
        if is_fraud_b:
            if sender != account_number: fraud_neighbors.add(sender)
            if receiver != account_number: fraud_neighbors.add(receiver)
            
        if sender == account_number:
            total_amount += amount_f
            tx_count += 1
            velocities.append(velocity_f)
            geo_anoms.append(geo_f)
            amounts.append(amount_f)
            
    if G.number_of_nodes() > max_nodes:
        degrees = dict(G.degree())
        top_nodes = sorted(degrees, key=degrees.get, reverse=True)[:max_nodes]
        G = G.subgraph(top_nodes)
        edges_list = [e for e in edges_list if e["from"] in G.nodes and e["to"] in G.nodes]
        
    in_degree = G.in_degree(account_number) if account_number in G else 0
    out_degree = G.out_degree(account_number) if account_number in G else 0
    
    cycles = 0
    try:
        all_cycles = list(nx.simple_cycles(G))
        cycles = sum(1 for c in all_cycles if account_number in c)
    except Exception:
        pass
        
    avg_velocity = float(np.mean(velocities)) if velocities else 0.0
    avg_geo = float(np.mean(geo_anoms)) if geo_anoms else 0.0
    avg_amount = float(np.mean(amounts)) if amounts else 0.0
    max_amount = float(np.max(amounts)) if amounts else 0.0
    
    # Predict anomalies using the Isolation Forest model
    model_path = os.path.join(MODEL_DIR, "network_anomaly_model.joblib")
    if os.path.exists(model_path):
        payload = joblib.load(model_path)
        clf = payload["model"]
        min_score = payload["min_score"]
        max_score = payload["max_score"]
        
        X = pd.DataFrame([{
            "total_amount": total_amount,
            "avg_amount": avg_amount,
            "max_amount": max_amount,
            "tx_count": tx_count,
            "velocity_mean": avg_velocity,
            "geo_anomaly_mean": avg_geo
        }])
        decision = float(clf.decision_function(X)[0])
        
        if decision <= 0:
            risk_score = 50.0 + 50.0 * (min(0.0, decision) / (min_score or -1e-5))
        else:
            risk_score = 50.0 * (1.0 - (decision / (max_score or 1e-5)))
            
        risk_score = min(100.0, max(0.0, risk_score))
    else:
        risk_score = min(100.0, (cycles * 25.0) + (len(fraud_neighbors) * 20.0) + (avg_velocity * 10.0))
        
    # Format node details for UI graph representation
    nodes_list = []
    degrees = dict(G.degree())
    for node in G.nodes:
        size = 15 + min(25, degrees.get(node, 1) * 2)
        node_risk = risk_score if node == account_number else (85 if node in fraud_neighbors else 10)
        
        nodes_list.append({
            "id": node,
            "label": node[:8] + "..." if len(node) > 8 else node,
            "title": f"Account: {node}<br>Degree: {degrees.get(node, 0)}",
            "size": size,
            "risk": int(node_risk)
        })
        
    return {
        "account_number": account_number,
        "risk_score": float(risk_score),
        "nodes": nodes_list,
        "edges": edges_list,
        "metrics": {
            "cycles_count": int(cycles),
            "in_degree": int(in_degree),
            "out_degree": int(out_degree),
            "velocity": float(avg_velocity),
            "fraud_neighbors": int(len(fraud_neighbors))
        }
    }

if __name__ == "__main__":
    train_network_model()
