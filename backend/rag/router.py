import re
from typing import Dict, Any, Tuple
from db import db_client

# Karnataka districts list for keyword matching
DISTRICTS = [
    "BAGALKOT", "BANGALORE", "BENGALURU", "BELAGAVI", "BELGAUM", "MYSURU", "MYSORE", 
    "DHARWAD", "KOLAR", "SHIMOGA", "SHIVAMOGGA", "TUMKUR", "TUMAKURU", "BIJAPUR", "VIJAYAPUR", 
    "UDUPI", "BELLARY", "BALLARI", "CHIKKABALLAPURA", "CHIKMAGALUR", "CHIKKAMAGALURU", "CHAMARAJANAGAR",
    "CHITRADURGA", "DAVANAGERE", "GADAG", "HASSAN", "HAVERI", "KODAGU", "KOPPAL", 
    "MANDYA", "RAICHUR", "RAMANAGARA", "UTTARA KANNADA", "YADGIR", "VIJAYANAGARA"
]

def find_districts(text: str) -> list:
    found = []
    text_upper = text.upper()
    for dist in DISTRICTS:
        # Match whole words only
        if re.search(r'\b' + re.escape(dist) + r'\b', text_upper):
            # Map alternative spellings to database names
            if dist == "BELGAUM":
                found.append("BELAGAVI")
            elif dist == "MYSORE":
                found.append("MYSURU")
            elif dist == "SHIMOGA":
                found.append("SHIVAMOGGA")
            elif dist == "TUMKUR":
                found.append("TUMAKURU")
            elif dist == "BIJAPUR":
                found.append("VIJAYAPUR")
            elif dist == "BELLARY":
                found.append("BALLARI")
            elif dist == "CHIKMAGALUR":
                found.append("CHIKKAMAGALURU")
            else:
                found.append(dist)
    return list(set(found))

def route_query(question: str) -> Tuple[str, Dict[str, Any]]:
    """
    Classifies the user query intent and provides matching execution plans.
    
    Returns: (intent_type, payload)
    """
    normalized = question.lower()
    
    # 1. Compare Intent
    if "compare" in normalized:
        dists = find_districts(question)
        if len(dists) >= 2:
            return "analytics", {
                "type": "comparison",
                "params": (dists[0].upper(), dists[1].upper()),
                "district": f"{dists[0]} vs {dists[1]}"
            }
            
    # 2. Top Crime Groups Intent
    if "top crime" in normalized or "crime groups" in normalized or "crime types" in normalized or "major crimes" in normalized:
        dists = find_districts(question)
        if dists:
            return "analytics", {
                "type": "top_crimes",
                "params": (dists[0].upper(),),
                "district": dists[0]
            }

    # 3. Crime Trends Intent
    if "trend" in normalized or "monthly count" in normalized or "crime count over time" in normalized:
        dists = find_districts(question)
        if dists:
            return "analytics", {
                "type": "trends",
                "params": (dists[0].upper(),),
                "district": dists[0]
            }

    # 4. Highest Arrest Rate Intent
    if "arrest rate" in normalized or "highest arrest" in normalized or "arrest ratio" in normalized:
        return "analytics", {
            "type": "arrest_rate",
            "params": (),
            "district": "All Districts"
        }
        
    # 5. Hybrid Intent
    if ("why" in normalized or "how" in normalized or "explain" in normalized or "reason" in normalized) and \
       ("financial" in normalized or "fraud" in normalized or "cyber" in normalized or "laundering" in normalized or "money" in normalized):
        return "hybrid", {
            "type": "hybrid_financial",
            "params": (),
            "district": "Statewide Financials"
        }
        
    return "knowledge", {}

def execute_analytics(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Runs analytical questions and aggregates/filters metrics in Python for database portability."""
    try:
        if payload.get("type") == "comparison":
            dists = payload["params"]
            p_rows = db_client.execute(
                "SELECT district_name, total_firs, total_arrested FROM mv_district_profile WHERE UPPER(district_name) = :d1 OR UPPER(district_name) = :d2;",
                {"d1": dists[0], "d2": dists[1]}
            ).fetchall()
            c_rows = db_client.execute(
                "SELECT district_name, SUM(total_convicted) FROM mv_monthly_trends WHERE UPPER(district_name) = :d1 OR UPPER(district_name) = :d2 GROUP BY district_name;",
                {"d1": dists[0], "d2": dists[1]}
            ).fetchall()
            
            c_map = {str(r[0]).upper(): float(r[1] or 0.0) for r in c_rows}
            
            data = []
            for r in p_rows:
                d_name = str(r[0])
                data.append({
                    "district_name": d_name,
                    "total_firs": int(r[1] or 0),
                    "total_arrested": int(r[2] or 0),
                    "total_convicted": int(c_map.get(d_name.upper(), 0.0))
                })
            return {
                "type": "comparison",
                "columns": ["district_name", "total_firs", "total_arrested", "total_convicted"],
                "data": data,
                "district": payload.get("district", "State"),
                "message": "Successfully retrieved analytical database results."
            }
            
        elif payload.get("type") == "top_crimes":
            dist = payload["params"][0]
            rows = db_client.execute(
                "SELECT crime_group_name, SUM(fir_count) FROM mv_monthly_trends WHERE UPPER(district_name) = :dist GROUP BY crime_group_name;",
                {"dist": dist}
            ).fetchall()
            
            data = []
            for r in rows:
                data.append({
                    "crime_group_name": str(r[0]),
                    "total_firs": int(r[1] or 0)
                })
            data.sort(key=lambda x: x["total_firs"], reverse=True)
            data = data[:10]
            return {
                "type": "top_crimes",
                "columns": ["crime_group_name", "total_firs"],
                "data": data,
                "district": payload.get("district", "State"),
                "message": "Successfully retrieved analytical database results."
            }
            
        elif payload.get("type") == "trends":
            dist = payload["params"][0]
            rows = db_client.execute(
                "SELECT month, SUM(fir_count) FROM mv_monthly_trends WHERE UPPER(district_name) = :dist GROUP BY month;",
                {"dist": dist}
            ).fetchall()
            
            data = []
            for r in rows:
                data.append({
                    "month": str(r[0])[:10],
                    "total_firs": int(r[1] or 0)
                })
            data.sort(key=lambda x: x["month"])
            return {
                "type": "trends",
                "columns": ["month", "total_firs"],
                "data": data,
                "district": payload.get("district", "State"),
                "message": "Successfully retrieved analytical database results."
            }
            
        elif payload.get("type") == "arrest_rate":
            rows = db_client.execute(
                "SELECT district_name, total_arrested, total_firs FROM mv_district_profile;"
            ).fetchall()
            
            data = []
            for r in rows:
                dist = str(r[0])
                total_arrested = int(r[1] or 0)
                total_firs = int(r[2] or 0)
                rate = round(100.0 * total_arrested / total_firs, 2) if total_firs > 0 else 0.0
                data.append({
                    "district_name": dist,
                    "total_arrested": total_arrested,
                    "total_firs": total_firs,
                    "arrest_rate": rate
                })
            data.sort(key=lambda x: x["arrest_rate"], reverse=True)
            data = data[:10]
            return {
                "type": "arrest_rate",
                "columns": ["district_name", "total_arrested", "total_firs", "arrest_rate"],
                "data": data,
                "district": payload.get("district", "State"),
                "message": "Successfully retrieved analytical database results."
            }
            
        elif payload.get("type") == "hybrid_financial":
            tx_count_rows = db_client.execute(
                "SELECT COUNT(*) FROM fact_financial_transactions WHERE is_fraud = 1;"
            ).fetchall()
            tx_count = int(tx_count_rows[0][0]) if tx_count_rows else 0
            
            tx_amount_rows = db_client.execute(
                "SELECT SUM(amount) FROM fact_financial_transactions WHERE is_fraud = 1;"
            ).fetchall()
            total_amount = float(tx_amount_rows[0][0] or 0.0) if tx_amount_rows else 0.0
            
            accounts_rows = db_client.execute(
                "SELECT COUNT(*) FROM dim_financial_accounts WHERE risk_score > 0.7;"
            ).fetchall()
            high_risk_count = int(accounts_rows[0][0]) if accounts_rows else 0
            
            data = [
                {"metric": "Total Fraud Transactions", "value": str(tx_count)},
                {"metric": "Total Fraud Amount", "value": f"₹{round(total_amount / 10000000.0, 2)} Cr"},
                {"metric": "High Risk Accounts (>0.7)", "value": str(high_risk_count)}
            ]
            return {
                "type": "hybrid_financial",
                "columns": ["metric", "value"],
                "data": data,
                "district": payload.get("district", "State"),
                "message": "Successfully retrieved analytical database results."
            }
            
        else:
            # Fallback profile execution
            rows = db_client.execute(
                "SELECT district_name, total_firs, total_arrested, total_victims FROM mv_district_profile;"
            ).fetchall()
            
            data = []
            for r in rows[:10]:
                data.append({
                    "district_name": str(r[0]),
                    "total_firs": int(r[1] or 0),
                    "total_arrested": int(r[2] or 0),
                    "total_victims": int(r[3] or 0)
                })
            return {
                "type": payload.get("type", "general_profile"),
                "columns": ["district_name", "total_firs", "total_arrested", "total_victims"],
                "data": data,
                "district": payload.get("district", "State"),
                "message": "Successfully retrieved analytical database results."
            }
    except Exception as e:
        return {
            "error": str(e),
            "message": "Failed to query database statistics."
        }
