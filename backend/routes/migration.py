import os
import sqlite3
import json
import uuid
import time
import threading
from typing import Dict, Any, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException
from db import db_client

router = APIRouter(tags=["Migration"])

# Deterministic Case ID for v1 Dataset Migration
MIGRATION_CASE_ID = "518173ad-cd97-5b6c-ba30-5ce5ab188c00"

# Global migration progress status tracking
migration_status = {
    "status": "idle",  # "idle", "running", "completed", "failed"
    "current_table": None,
    "current_offset": 0,
    "total_entities_migrated": 0,
    "total_relationships_migrated": 0,
    "error_message": None,
    "last_run_time": None
}

migration_lock = threading.Lock()

def get_connection():
    # Directly connect to the SQLite DB for maximum batch write performance in local mode
    return sqlite3.connect(db_client.sqlite_path)

def initialize_migration_metadata():
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Create Case if not exists
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        cursor.execute("""
        INSERT OR IGNORE INTO cases (id, name, type, ontology_version, created_by, created_at, status, permissions, ui_state)
        VALUES (?, ?, 'crime-analysis', 'crime-analysis-v1', 'system', ?, 'active', '[]', '{}');
        """, (MIGRATION_CASE_ID, "v1 Dataset Migration", now))
        
        # Create Checkpoints table if not exists
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS migration_checkpoints (
            table_name TEXT PRIMARY KEY,
            last_processed_offset INTEGER DEFAULT 0
        );
        """)
        
        # Seed default checkpoint rows
        tables = [
            "dim_police_units",
            "fact_fir_events",
            "dim_financial_accounts",
            "fact_financial_transactions",
            "fact_call_detail_records"
        ]
        for t in tables:
            cursor.execute("INSERT OR IGNORE INTO migration_checkpoints (table_name, last_processed_offset) VALUES (?, 0);", (t,))
        conn.commit()
    finally:
        conn.close()

def execute_batch_migration():
    global migration_status
    if not migration_lock.acquire(blocking=False):
        # Already running
        return
        
    migration_status["status"] = "running"
    migration_status["error_message"] = None
    migration_status["last_run_time"] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    
    try:
        initialize_migration_metadata()
        
        # Ingestion Order:
        # 1. Locations / Police Stations (dim_police_units)
        migrate_police_units()
        
        # 2. Crimes / FIR Details (fact_fir_events)
        migrate_fir_events()
        
        # 3. Bank Accounts (dim_financial_accounts)
        migrate_bank_accounts()
        
        # 4. Financial Transactions (fact_financial_transactions)
        migrate_transactions()
        
        # 5. Phone CDRs (fact_call_detail_records)
        migrate_cdrs()
        
        migration_status["status"] = "completed"
        migration_status["current_table"] = None
    except Exception as e:
        import traceback
        print(f"[Migration] Error occurred during batch migration: {e}")
        traceback.print_exc()
        migration_status["status"] = "failed"
        migration_status["error_message"] = str(e)
    finally:
        migration_lock.release()

def get_checkpoint(table_name: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT last_processed_offset FROM migration_checkpoints WHERE table_name = ?;", (table_name,))
        row = cursor.fetchone()
        return row[0] if row else 0
    except sqlite3.OperationalError as e:
        if "no such table" in str(e):
            return 0
        raise e
    finally:
        conn.close()

def save_checkpoint(table_name: str, offset: int):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT OR REPLACE INTO migration_checkpoints (table_name, last_processed_offset) VALUES (?, ?);", (table_name, offset))
        conn.commit()
    except sqlite3.OperationalError as e:
        if "no such table" in str(e):
            initialize_migration_metadata()
            cursor.execute("INSERT OR REPLACE INTO migration_checkpoints (table_name, last_processed_offset) VALUES (?, ?);", (table_name, offset))
            conn.commit()
        else:
            raise e
    finally:
        conn.close()

def migrate_police_units():
    global migration_status
    table = "dim_police_units"
    migration_status["current_table"] = table
    offset = get_checkpoint(table)
    migration_status["current_offset"] = offset
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Fetch units
        cursor.execute("""
            SELECT ROWID, unit_id, unit_name, district_name, circle_name, latitude, longitude
            FROM dim_police_units
            WHERE ROWID > ?
            ORDER BY ROWID;
        """, (offset,))
        rows = cursor.fetchall()
        
        if not rows:
            return
            
        entities_batch = []
        rels_batch = []
        max_rowid = offset
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        
        for r in rows:
            rowid, unit_id, unit_name, district_name, circle_name, lat, lon = r
            max_rowid = max(max_rowid, rowid)
            
            # Deterministic IDs
            loc_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"location_pu_{unit_id}"))
            ps_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"police_unit_ps_{unit_id}"))
            
            # 1. Location Entity
            loc_props = {
                "name": f"{unit_name} Location",
                "address": f"{circle_name or 'Circle'}, {district_name or 'District'}",
                "coordinates": f"{lat},{lon}" if lat and lon else ""
            }
            loc_hist = [{"timestamp": now, "action": "create", "properties": loc_props, "confidence": 1.0, "modified_by": "migration"}]
            loc_loc = json.dumps({"type": "Point", "coordinates": [lon, lat]}) if lat and lon else None
            
            entities_batch.append((
                loc_id, MIGRATION_CASE_ID, "Location", json.dumps(loc_props), 1.0,
                "migration", "system", now, now, None, "[]", loc_loc, json.dumps(loc_hist)
            ))
            
            # 2. PoliceStation Entity
            ps_props = {
                "name": unit_name,
                "district": district_name or "",
                "circle": circle_name or "",
                "coordinates": f"{lat},{lon}" if lat and lon else ""
            }
            ps_hist = [{"timestamp": now, "action": "create", "properties": ps_props, "confidence": 1.0, "modified_by": "migration"}]
            
            entities_batch.append((
                ps_id, MIGRATION_CASE_ID, "PoliceStation", json.dumps(ps_props), 1.0,
                "migration", "system", now, now, None, "[]", loc_loc, json.dumps(ps_hist)
            ))
            
            # 3. located_at Relationship (PoliceStation -> Location)
            rel_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"rel_ps_loc_{unit_id}"))
            rel_hist = [{"timestamp": now, "action": "create", "label": "Located At", "confidence": 1.0, "modified_by": "migration"}]
            
            rels_batch.append((
                rel_id, MIGRATION_CASE_ID, ps_id, loc_id, "located_at", "Located At", 1.0,
                json.dumps([]), "system", now, now, json.dumps(rel_hist)
            ))
            
        # Bulk Insert
        if entities_batch:
            cursor.executemany("""
                INSERT OR IGNORE INTO entities (id, case_id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, entities_batch)
            migration_status["total_entities_migrated"] += cursor.rowcount
            
        if rels_batch:
            cursor.executemany("""
                INSERT OR IGNORE INTO relationships (id, case_id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated, version_history)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, rels_batch)
            migration_status["total_relationships_migrated"] += cursor.rowcount
            
        conn.commit()
        save_checkpoint(table, max_rowid)
        migration_status["current_offset"] = max_rowid
    finally:
        conn.close()

def migrate_fir_events():
    global migration_status
    table = "fact_fir_events"
    migration_status["current_table"] = table
    
    batch_size = 5000
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    
    while True:
        offset = get_checkpoint(table)
        migration_status["current_offset"] = offset
        
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT 
                    f.ROWID,
                    f.fir_id,
                    f.fir_number,
                    f.unit_id,
                    f.geo_id,
                    f.crime_class_id,
                    f.fir_date,
                    f.offence_duration_minutes,
                    f.fir_type,
                    f.fir_stage,
                    f.complaint_mode,
                    f.io_name,
                    f.io_kgid,
                    f.victim_count,
                    f.accused_count,
                    f.arrested_count,
                    f.conviction_count,
                    f.latitude,
                    f.longitude,
                    pu.unit_name,
                    c.crime_group_name,
                    c.crime_head_name,
                    g.district_name,
                    g.sub_district_name,
                    d.population_total,
                    d.population_urban,
                    d.literacy_rate,
                    d.consumption_index,
                    d.facebook_wealth_index
                FROM fact_fir_events f
                LEFT JOIN dim_police_units pu ON f.unit_id = pu.unit_id
                LEFT JOIN dim_crime_classification c ON f.crime_class_id = c.crime_class_id
                LEFT JOIN dim_geography g ON f.geo_id = g.geo_id
                LEFT JOIN dim_demographics d ON f.geo_id = d.geo_id
                WHERE f.ROWID > ?
                ORDER BY f.ROWID
                LIMIT ?;
            """, (offset, batch_size))
            rows = cursor.fetchall()
            
            if not rows:
                break
                
            entities_batch = []
            rels_batch = []
            max_rowid = offset
            
            for r in rows:
                (rowid, fir_id, fir_number, unit_id, geo_id, crime_class_id, fir_date,
                 offence_dur, fir_type, fir_stage, complaint_mode, io_name, io_kgid,
                 vic_cnt, acc_cnt, arr_cnt, conv_cnt, lat, lon, unit_name,
                 c_group, c_head, dist_name, sub_dist_name, pop_total, pop_urban,
                 literacy, consumption, fb_wealth) = r
                
                max_rowid = max(max_rowid, rowid)
                
                crime_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"crime_fir_{fir_id}"))
                loc_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"location_fir_scene_{fir_id}"))
                ps_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"police_unit_ps_{unit_id}")) if unit_id else None
                
                # 1. Crime Entity
                crime_props = {
                    "fir_number": fir_number,
                    "ipc_sections": f"{c_group or 'IPC'} - {c_head or 'Crime'}",
                    "date": fir_date,
                    "station": unit_name or "Unknown Station"
                }
                crime_hist = [{"timestamp": now, "action": "create", "properties": crime_props, "confidence": 1.0, "modified_by": "migration"}]
                
                entities_batch.append((
                    crime_id, MIGRATION_CASE_ID, "Crime", json.dumps(crime_props), 1.0,
                    "migration", "system", now, now, None, "[]", None, json.dumps(crime_hist)
                ))
                
                # 2. Location Entity (enriched with demographic data)
                loc_props = {
                    "name": f"Incident Scene (FIR {fir_number})",
                    "address": f"District: {dist_name or unit_name or 'Unknown'}",
                    "coordinates": f"{lat},{lon}" if lat and lon else ""
                }
                if dist_name: loc_props["district_name"] = dist_name
                if sub_dist_name: loc_props["sub_district_name"] = sub_dist_name
                if pop_total is not None: loc_props["population_total"] = int(pop_total)
                if pop_urban is not None: loc_props["population_urban"] = int(pop_urban)
                if literacy is not None: loc_props["literacy_rate"] = float(literacy)
                if consumption is not None: loc_props["consumption_index"] = float(consumption)
                if fb_wealth is not None: loc_props["facebook_wealth_index"] = float(fb_wealth)
                
                loc_hist = [{"timestamp": now, "action": "create", "properties": loc_props, "confidence": 1.0, "modified_by": "migration"}]
                loc_loc = json.dumps({"type": "Point", "coordinates": [lon, lat]}) if lat and lon else None
                
                entities_batch.append((
                    loc_id, MIGRATION_CASE_ID, "Location", json.dumps(loc_props), 1.0,
                    "migration", "system", now, now, None, "[]", loc_loc, json.dumps(loc_hist)
                ))
                
                # 3. located_at Relationship (Crime -> Location)
                crime_loc_rel_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"rel_crime_loc_{fir_id}"))
                rel_hist_loc = [{"timestamp": now, "action": "create", "label": "Occurred At", "confidence": 1.0, "modified_by": "migration"}]
                
                rels_batch.append((
                    crime_loc_rel_id, MIGRATION_CASE_ID, crime_id, loc_id, "located_at", "Occurred At", 1.0,
                    json.dumps([{"type": "fir_record", "fir_id": fir_id}]), "system", now, now, json.dumps(rel_hist_loc)
                ))
                
                # 4. located_at Relationship (Crime -> PoliceStation)
                if ps_id:
                    crime_ps_rel_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"rel_crime_ps_{fir_id}"))
                    rel_hist_ps = [{"timestamp": now, "action": "create", "label": "Registered At", "confidence": 1.0, "modified_by": "migration"}]
                    
                    rels_batch.append((
                        crime_ps_rel_id, MIGRATION_CASE_ID, crime_id, ps_id, "located_at", "Registered At", 1.0,
                        json.dumps([{"type": "fir_record", "fir_id": fir_id}]), "system", now, now, json.dumps(rel_hist_ps)
                    ))
                    
            # Bulk write
            cursor.executemany("""
                INSERT OR IGNORE INTO entities (id, case_id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, entities_batch)
            migration_status["total_entities_migrated"] += cursor.rowcount
            
            cursor.executemany("""
                INSERT OR IGNORE INTO relationships (id, case_id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated, version_history)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, rels_batch)
            migration_status["total_relationships_migrated"] += cursor.rowcount
            
            conn.commit()
            save_checkpoint(table, max_rowid)
        finally:
            conn.close()

def migrate_bank_accounts():
    global migration_status
    table = "dim_financial_accounts"
    migration_status["current_table"] = table
    
    batch_size = 5000
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    
    while True:
        offset = get_checkpoint(table)
        migration_status["current_offset"] = offset
        
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT ROWID, account_number, owner_name, bank_name, risk_score
                FROM dim_financial_accounts
                WHERE ROWID > ?
                ORDER BY ROWID
                LIMIT ?;
            """, (offset, batch_size))
            rows = cursor.fetchall()
            
            if not rows:
                break
                
            entities_batch = []
            rels_batch = []
            max_rowid = offset
            
            for r in rows:
                rowid, acc_num, owner, bank, risk = r
                max_rowid = max(max_rowid, rowid)
                
                acc_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"bank_account_{acc_num}"))
                owner_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"person_owner_{owner}"))
                
                # 1. BankAccount Entity
                acc_props = {
                    "account_number": acc_num,
                    "institution": bank,
                    "balance": 0.0
                }
                acc_hist = [{"timestamp": now, "action": "create", "properties": acc_props, "confidence": 1.0, "modified_by": "migration"}]
                
                entities_batch.append((
                    acc_id, MIGRATION_CASE_ID, "BankAccount", json.dumps(acc_props), 1.0,
                    "migration", "system", now, now, None, "[]", None, json.dumps(acc_hist)
                ))
                
                # 2. Person Entity (Owner)
                person_props = {
                    "name": owner,
                    "DOB": "",
                    "aliases": [],
                    "national_id": ""
                }
                person_hist = [{"timestamp": now, "action": "create", "properties": person_props, "confidence": 1.0, "modified_by": "migration"}]
                
                entities_batch.append((
                    owner_id, MIGRATION_CASE_ID, "Person", json.dumps(person_props), 1.0,
                    "migration", "system", now, now, None, "[]", None, json.dumps(person_hist)
                ))
                
                # 3. registered_owner_of Relationship
                rel_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"rel_owner_{owner}_{acc_num}"))
                rel_hist = [{"timestamp": now, "action": "create", "label": "Registered Owner", "confidence": 1.0, "modified_by": "migration"}]
                
                rels_batch.append((
                    rel_id, MIGRATION_CASE_ID, owner_id, acc_id, "registered_owner_of", "Registered Owner", 1.0,
                    json.dumps([{"type": "account_record", "account_number": acc_num}]), "system", now, now, json.dumps(rel_hist)
                ))
                
            # Bulk write
            cursor.executemany("""
                INSERT OR IGNORE INTO entities (id, case_id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, entities_batch)
            migration_status["total_entities_migrated"] += cursor.rowcount
            
            cursor.executemany("""
                INSERT OR IGNORE INTO relationships (id, case_id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated, version_history)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, rels_batch)
            migration_status["total_relationships_migrated"] += cursor.rowcount
            
            conn.commit()
            save_checkpoint(table, max_rowid)
        finally:
            conn.close()

def migrate_transactions():
    global migration_status
    table = "fact_financial_transactions"
    migration_status["current_table"] = table
    
    batch_size = 5000
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    
    while True:
        offset = get_checkpoint(table)
        migration_status["current_offset"] = offset
        
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT ROWID, transaction_id, timestamp, sender_account, receiver_account, amount, transaction_type, is_fraud, velocity_score, geo_anomaly_score
                FROM fact_financial_transactions
                WHERE ROWID > ?
                ORDER BY ROWID
                LIMIT ?;
            """, (offset, batch_size))
            rows = cursor.fetchall()
            
            if not rows:
                break
                
            rels_batch = []
            entities_batch = [] # Handle accounts that are mentioned in transactions but missing from dim_financial_accounts
            max_rowid = offset
            
            for r in rows:
                rowid, tx_id, ts, sender, receiver, amount, tx_type, is_fraud, vel, geo_score = r
                max_rowid = max(max_rowid, rowid)
                
                src_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"bank_account_{sender}"))
                tgt_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"bank_account_{receiver}"))
                
                # Check / Ensure both accounts exist (safeguard)
                for acc_num, entity_id in [(sender, src_id), (receiver, tgt_id)]:
                    acc_props = {"account_number": acc_num, "institution": "Unknown Institution", "balance": 0.0}
                    acc_hist = [{"timestamp": now, "action": "create", "properties": acc_props, "confidence": 1.0, "modified_by": "migration"}]
                    entities_batch.append((
                        entity_id, MIGRATION_CASE_ID, "BankAccount", json.dumps(acc_props), 1.0,
                        "migration", "system", now, now, None, "[]", None, json.dumps(acc_hist)
                    ))
                
                rel_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"rel_transfer_{tx_id}"))
                evidence = [{
                    "type": "financial_transaction",
                    "transaction_id": tx_id,
                    "amount": amount,
                    "timestamp": ts,
                    "transaction_type": tx_type,
                    "is_fraud": bool(is_fraud),
                    "velocity_score": vel,
                    "geo_anomaly_score": geo_score
                }]
                
                rel_hist = [{"timestamp": now, "action": "create", "label": f"Transfer of ₹{amount}", "confidence": 1.0, "modified_by": "migration"}]
                
                rels_batch.append((
                    rel_id, MIGRATION_CASE_ID, src_id, tgt_id, "financial_transfer_to", f"Transfer of ₹{amount}", 1.0,
                    json.dumps(evidence), "system", now, now, json.dumps(rel_hist)
                ))
                
            # Bulk write
            if entities_batch:
                cursor.executemany("""
                    INSERT OR IGNORE INTO entities (id, case_id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, entities_batch)
                migration_status["total_entities_migrated"] += cursor.rowcount
                
            cursor.executemany("""
                INSERT OR IGNORE INTO relationships (id, case_id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated, version_history)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, rels_batch)
            migration_status["total_relationships_migrated"] += cursor.rowcount
            
            conn.commit()
            save_checkpoint(table, max_rowid)
        finally:
            conn.close()

def migrate_cdrs():
    global migration_status
    table = "fact_call_detail_records"
    migration_status["current_table"] = table
    
    batch_size = 5000
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    
    while True:
        offset = get_checkpoint(table)
        migration_status["current_offset"] = offset
        
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT ROWID, cdr_id, caller_number, receiver_number, caller_company, receiver_company, call_timestamp, duration_seconds, cell_tower_id
                FROM fact_call_detail_records
                WHERE ROWID > ?
                ORDER BY ROWID
                LIMIT ?;
            """, (offset, batch_size))
            rows = cursor.fetchall()
            
            if not rows:
                break
                
            entities_batch = []
            rels_batch = []
            max_rowid = offset
            
            for r in rows:
                rowid, cdr_id, caller, receiver, caller_co, receiver_co, ts, duration, cell_tower = r
                max_rowid = max(max_rowid, rowid)
                
                src_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"phone_{caller}"))
                tgt_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"phone_{receiver}"))
                
                # 1. Caller Phone Entity
                caller_props = {"number": caller, "carrier": caller_co or "", "IMEI": ""}
                caller_hist = [{"timestamp": now, "action": "create", "properties": caller_props, "confidence": 1.0, "modified_by": "migration"}]
                entities_batch.append((
                    src_id, MIGRATION_CASE_ID, "Phone", json.dumps(caller_props), 1.0,
                    "migration", "system", now, now, None, "[]", None, json.dumps(caller_hist)
                ))
                
                # 2. Receiver Phone Entity
                receiver_props = {"number": receiver, "carrier": receiver_co or "", "IMEI": ""}
                receiver_hist = [{"timestamp": now, "action": "create", "properties": receiver_props, "confidence": 1.0, "modified_by": "migration"}]
                entities_batch.append((
                    tgt_id, MIGRATION_CASE_ID, "Phone", json.dumps(receiver_props), 1.0,
                    "migration", "system", now, now, None, "[]", None, json.dumps(receiver_hist)
                ))
                
                # 3. called Relationship
                rel_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"rel_call_{cdr_id}"))
                evidence = [{
                    "type": "cdr_record",
                    "cdr_id": int(cdr_id),
                    "timestamp": ts,
                    "duration_seconds": int(duration or 0),
                    "cell_tower_id": cell_tower
                }]
                
                rel_hist = [{"timestamp": now, "action": "create", "label": f"Call duration: {duration}s", "confidence": 1.0, "modified_by": "migration"}]
                
                rels_batch.append((
                    rel_id, MIGRATION_CASE_ID, src_id, tgt_id, "called", f"Call duration: {duration}s", 1.0,
                    json.dumps(evidence), "system", now, now, json.dumps(rel_hist)
                ))
                
            # Bulk write
            cursor.executemany("""
                INSERT OR IGNORE INTO entities (id, case_id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, entities_batch)
            migration_status["total_entities_migrated"] += cursor.rowcount
            
            cursor.executemany("""
                INSERT OR IGNORE INTO relationships (id, case_id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated, version_history)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, rels_batch)
            migration_status["total_relationships_migrated"] += cursor.rowcount
            
            conn.commit()
            save_checkpoint(table, max_rowid)
        finally:
            conn.close()

@router.post("/run")
def start_batch_migration(background_tasks: BackgroundTasks):
    global migration_status
    if migration_status["status"] == "running":
        return {"status": "already_running", "message": "Migration is currently running in the background."}
        
    background_tasks.add_task(execute_batch_migration)
    return {"status": "started", "message": "Migration job initiated in the background."}

@router.get("/status")
def get_migration_status():
    tables = [
        "dim_police_units",
        "fact_fir_events",
        "dim_financial_accounts",
        "fact_financial_transactions",
        "fact_call_detail_records"
    ]
    checkpoints = {}
    for t in tables:
        checkpoints[t] = get_checkpoint(t)
        
    # Get current row counts in Graph
    graph_entities_count = 0
    graph_relationships_count = 0
    try:
        ent_res = db_client.execute("SELECT COUNT(*) FROM entities WHERE case_id = :case_id;", {"case_id": MIGRATION_CASE_ID})
        graph_entities_count = ent_res.fetchone()[0]
        
        rel_res = db_client.execute("SELECT COUNT(*) FROM relationships WHERE case_id = :case_id;", {"case_id": MIGRATION_CASE_ID})
        graph_relationships_count = rel_res.fetchone()[0]
    except Exception:
        pass
        
    return {
        "migration_job": migration_status,
        "checkpoints": checkpoints,
        "graph_statistics": {
            "case_id": MIGRATION_CASE_ID,
            "entities_count": graph_entities_count,
            "relationships_count": graph_relationships_count
        }
    }
