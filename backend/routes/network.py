from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List
import cache
from db import get_db, CatalystDBClient

router = APIRouter(tags=["Network"])

@router.get("/fraud-graph")
def get_fraud_graph(
    limit: int = Query(200, le=1000),
    min_amount: float = Query(0.0),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns a fraud transaction network subgraph (nodes & edges).
    Sized by transaction count, colored by risk score.
    """
    cache_key = f"fraud_graph_{limit}_{min_amount}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Query edges without limit in query to avoid cross-compat issues, apply limit in Python
    sql = """
        SELECT
            source,
            target,
            transaction_count,
            total_amount,
            sender_risk,
            receiver_risk,
            sender_name,
            receiver_name,
            sender_bank,
            receiver_bank
        FROM mv_fraud_graph_edges
        WHERE total_amount >= :min_amount
        ORDER BY total_amount DESC;
    """
    result = db.execute(sql, {"min_amount": min_amount}).fetchall()
    
    nodes_dict = {}
    edges = []
    
    for row in result[:limit]:
        source, target, tx_count, total_amount, s_risk, r_risk, s_name, r_name, s_bank, r_bank = row
        
        # Add source node
        if source not in nodes_dict:
            nodes_dict[source] = {
                "id": source,
                "label": f"{s_name}\n({source})",
                "owner": s_name,
                "bank": s_bank,
                "risk_score": float(s_risk or 0.0),
                "val": 1
            }
        else:
            nodes_dict[source]["val"] += 1
            
        # Add target node
        if target not in nodes_dict:
            nodes_dict[target] = {
                "id": target,
                "label": f"{r_name}\n({target})",
                "owner": r_name,
                "bank": r_bank,
                "risk_score": float(r_risk or 0.0),
                "val": 1
            }
        else:
            nodes_dict[target]["val"] += 1
            
        # Add edge
        edges.append({
            "from": source,
            "to": target,
            "value": float(total_amount),
            "label": f"₹{float(total_amount):,.0f} ({tx_count} tx)",
            "title": f"Total Amount: ₹{float(total_amount):,.2f}\nTransactions: {tx_count}",
            "amount": float(total_amount),
            "count": int(tx_count)
        })
        
    res = {
        "nodes": list(nodes_dict.values()),
        "edges": edges
    }
    cache.set(cache_key, res)
    return res

@router.get("/cdr-graph")
def get_cdr_graph(
    limit: int = Query(300, le=1000),
    min_calls: int = Query(2),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Returns a CDR call network subgraph (nodes & edges).
    Nodes = Phone numbers. Edges = Communicating links.
    """
    # Group by caller/receiver and aggregate in SQL, filter count in Python
    sql = """
        SELECT
            caller_number,
            receiver_number,
            caller_company,
            receiver_company,
            duration_seconds
        FROM fact_call_detail_records;
    """
    result = db.execute(sql).fetchall()
    
    # Process grouping in Python
    agg_calls = {}
    for row in result:
        caller, receiver, caller_co, receiver_co, duration = row
        key = (caller, receiver, caller_co, receiver_co)
        if key not in agg_calls:
            agg_calls[key] = {"count": 0, "duration": 0}
        agg_calls[key]["count"] += 1
        agg_calls[key]["duration"] += int(duration or 0)
        
    filtered_calls = []
    for key, stats in agg_calls.items():
        if stats["count"] >= min_calls:
            filtered_calls.append((key[0], key[1], stats["count"], stats["duration"], key[2], key[3]))
            
    filtered_calls.sort(key=lambda x: x[2], reverse=True)
    
    nodes_dict = {}
    edges = []
    
    for row in filtered_calls[:limit]:
        source, target, call_count, duration, s_co, r_co = row
        
        # Add source node
        if source not in nodes_dict:
            nodes_dict[source] = {
                "id": source,
                "label": f"{source}\n({s_co})",
                "company": s_co,
                "val": 1
            }
        else:
            nodes_dict[source]["val"] += 1
            
        # Add target node
        if target not in nodes_dict:
            nodes_dict[target] = {
                "id": target,
                "label": f"{target}\n({r_co})",
                "company": r_co,
                "val": 1
            }
        else:
            nodes_dict[target]["val"] += 1
            
        # Add edge
        edges.append({
            "from": source,
            "to": target,
            "value": int(call_count),
            "label": f"{call_count} calls",
            "title": f"Calls: {call_count}\nDuration: {duration}s",
            "calls": int(call_count),
            "duration": int(duration)
        })
        
    return {
        "nodes": list(nodes_dict.values()),
        "edges": edges
    }

@router.get("/fraud-chain/{account_number}")
def trace_fraud_chain(
    account_number: str,
    hops: int = Query(3, le=5),
    db: CatalystDBClient = Depends(get_db)
):
    """
    Recursive multi-hop fraud money path tracing from a specific account.
    Returns nodes & edges for the traced path.
    """
    # First verify the account exists
    check_sql = "SELECT account_number, owner_name, bank_name, risk_score FROM dim_financial_accounts WHERE account_number = :account_number;"
    acc_res = db.execute(check_sql, {"account_number": account_number})
    acc = acc_res.fetchone()
    if not acc:
        raise HTTPException(status_code=404, detail=f"Account '{account_number}' not found")
        
    # Fetch all fraud edges to build adjacency list in Python
    edges_sql = """
        SELECT source, target, transaction_count, total_amount, sender_risk, receiver_risk, sender_name, receiver_name, sender_bank, receiver_bank
        FROM mv_fraud_graph_edges;
    """
    all_edges = db.execute(edges_sql).fetchall()
    
    # Map edge connections: source_account -> list of (target_account, amount)
    graph = {}
    for row in all_edges:
        src, tgt, _, amount, _, _, _, _, _, _ = row
        if src not in graph:
            graph[src] = []
        graph[src].append((tgt, float(amount or 0.0)))
        
    # BFS traversal path tracing in Python
    paths = []
    # Queue item format: (current_node, path_tuple, cum_amount, depth)
    queue = [(account_number, (account_number,), 0.0, 0)]
    
    while queue:
        curr, path, cum_amt, depth = queue.pop(0)
        
        if depth >= hops:
            continue
            
        if curr in graph:
            for neighbor, amt in graph[curr]:
                if neighbor not in path:  # Prevent circular paths
                    new_path = path + (neighbor,)
                    new_amt = cum_amt + amt
                    new_depth = depth + 1
                    paths.append((account_number, neighbor, new_path, new_amt, new_depth))
                    queue.append((neighbor, new_path, new_amt, new_depth))
                    
    # Limit to top 100 paths
    result = paths[:100]
    
    if not result:
        # Just return the single seed node if no fraud connections exist
        return {
            "nodes": [{
                "id": acc[0],
                "label": f"{acc[1]}\n({acc[0]})",
                "owner": acc[1],
                "bank": acc[2],
                "risk_score": float(acc[3] or 0.0),
                "val": 1
            }],
            "edges": []
        }
        
    nodes_dict = {}
    edges = []
    
    # Trace nodes
    accounts_to_fetch = set()
    for row in result:
        origin, current, path, _, _ = row
        for acc_id in path:
            accounts_to_fetch.add(acc_id)
            
    # Fetch details for all accounts in paths
    acc_details = {}
    if accounts_to_fetch:
        # Interpolate IN parameters directly
        accounts_tuple_str = ", ".join([f"'{a}'" for a in accounts_to_fetch])
        details_sql = f"SELECT account_number, owner_name, bank_name, risk_score FROM dim_financial_accounts WHERE account_number IN ({accounts_tuple_str});"
        details_res = db.execute(details_sql).fetchall()
        for r in details_res:
            acc_details[r[0]] = {
                "owner": r[1],
                "bank": r[2],
                "risk": float(r[3] or 0.0)
            }
            
    for row in result:
        origin, current, path, amount, depth = row
        
        # Build node objects
        for acc_id in path:
            if acc_id not in nodes_dict:
                details = acc_details.get(acc_id, {"owner": "Unknown", "bank": "Unknown", "risk": 0.0})
                nodes_dict[acc_id] = {
                    "id": acc_id,
                    "label": f"{details['owner']}\n({acc_id})",
                    "owner": details['owner'],
                    "bank": details['bank'],
                    "risk_score": details['risk'],
                    "val": 1
                }
            else:
                nodes_dict[acc_id]["val"] += 1
                
        # Build edge path
        for i in range(len(path) - 1):
            s = path[i]
            t = path[i+1]
            # Avoid duplicate edges in path visualization
            edge_exists = any(e["from"] == s and e["to"] == t for e in edges)
            if not edge_exists:
                edges.append({
                    "from": s,
                    "to": t,
                    "label": f"Hop {i+1}",
                    "title": f"Money flow from Hop {i+1}",
                    "color": {"color": "#ef4444", "highlight": "#f87171"}
                })
                
    return {
        "nodes": list(nodes_dict.values()),
        "edges": edges
    }

@router.get("/stats")
def get_network_stats(db: CatalystDBClient = Depends(get_db)):
    """
    Returns summary KPIs for financial and CDR networks.
    """
    cached = cache.get("network_stats")
    if cached is not None:
        return cached

    sql = """
        SELECT
            total_fraud_transactions,
            total_fraud_amount,
            total_cdr_records,
            unique_callers,
            high_risk_accounts
        FROM mv_network_stats;
    """
    result = db.execute(sql)
    row = result.fetchone()
    
    if not row:
        res = {
            "total_fraud_transactions": 0,
            "total_fraud_amount": 0.0,
            "total_cdr_records": 0,
            "unique_callers": 0,
            "high_risk_accounts": 0
        }
    else:
        res = {
            "total_fraud_transactions": int(row[0] or 0),
            "total_fraud_amount": float(row[1] or 0.0),
            "total_cdr_records": int(row[2] or 0),
            "unique_callers": int(row[3] or 0),
            "high_risk_accounts": int(row[4] or 0)
        }
    cache.set("network_stats", res)
    return res
