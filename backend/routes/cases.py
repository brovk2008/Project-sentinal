import uuid
import json
import time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from db import db_client

router = APIRouter(tags=["Cases v2"])

class CaseCreateSchema(BaseModel):
    name: str
    type: str # "crime-analysis" | "disaster-response" | "fraud-investigation"
    ontology_version: Optional[str] = "crime-analysis-v1"
    created_by: Optional[str] = "analyst"

class UIStateUpdateSchema(BaseModel):
    ui_state: Dict[str, Any]

@router.get("/")
def list_cases():
    try:
        sql = "SELECT id, name, type, ontology_version, created_by, created_at, status, permissions FROM cases;"
        res = db_client.execute(sql)
        rows = res.fetchall()
        
        cases = []
        for r in rows:
            cases.append({
                "id": r[0],
                "name": r[1],
                "type": r[2],
                "ontology_version": r[3],
                "created_by": r[4],
                "created_at": r[5],
                "status": r[6],
                "permissions": json.loads(r[7]) if r[7] else []
            })
        return cases
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
def create_case(payload: CaseCreateSchema):
    case_id = str(uuid.uuid4())
    created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        sql = """
        INSERT INTO cases (id, name, type, ontology_version, created_by, created_at, status, permissions, ui_state)
        VALUES (:id, :name, :type, :ontology_version, :created_by, :created_at, 'active', :permissions, :ui_state);
        """
        # Seed default UI state
        default_ui = {
            "panel_layout": {
                "left": {"size": 25, "visible": True},
                "center": {"activeTab": "canvas"},
                "right": {"size": 30, "visible": True},
                "bottom": {"size": 15, "visible": True}
            },
            "open_tabs": ["canvas"],
            "map_position": {"lat": 12.9716, "lng": 77.5946, "zoom": 12}, # Bengaluru default
            "timeline_position": {"start": None, "end": None}
        }
        db_client.execute(sql, {
            "id": case_id,
            "name": payload.name,
            "type": payload.type,
            "ontology_version": payload.ontology_version,
            "created_by": payload.created_by,
            "created_at": created_at,
            "permissions": json.dumps([]),
            "ui_state": json.dumps(default_ui)
        })
        
        # Initialize empty Case Memory
        memory_sql = """
        INSERT INTO case_memory (case_id, context, reasoning_log, notes, chat_history)
        VALUES (:case_id, :context, :reasoning_log, :notes, :chat_history);
        """
        context_data = {
            "case_name": payload.name,
            "case_type": payload.type,
            "goals": ["Identify network entities", "Trace communication vectors"]
        }
        db_client.execute(memory_sql, {
            "case_id": case_id,
            "context": json.dumps(context_data),
            "reasoning_log": "[]",
            "notes": "[]",
            "chat_history": "[]"
        })
        
        return {"status": "success", "case_id": case_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{case_id}")
def get_case(case_id: str):
    try:
        sql = "SELECT id, name, type, ontology_version, created_by, created_at, status, permissions, ui_state FROM cases WHERE id = :id;"
        res = db_client.execute(sql, {"id": case_id})
        row = res.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
            
        return {
            "id": row[0],
            "name": row[1],
            "type": row[2],
            "ontology_version": row[3],
            "created_by": row[4],
            "created_at": row[5],
            "status": row[6],
            "permissions": json.loads(row[7]) if row[7] else [],
            "ui_state": json.loads(row[8]) if row[8] else {}
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{case_id}/ui_state")
def update_ui_state(case_id: str, payload: UIStateUpdateSchema):
    try:
        sql = "UPDATE cases SET ui_state = :ui_state WHERE id = :id;"
        db_client.execute(sql, {
            "id": case_id,
            "ui_state": json.dumps(payload.ui_state)
        })
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{case_id}/duplicate")
def duplicate_case(case_id: str, payload: CaseCreateSchema):
    new_case_id = str(uuid.uuid4())
    created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        # Create base case record
        sql = """
        INSERT INTO cases (id, name, type, ontology_version, created_by, created_at, status, permissions, ui_state)
        VALUES (:id, :name, :type, :ontology_version, :created_by, :created_at, 'active', :permissions, :ui_state);
        """
        # Fetch current UI state
        curr_sql = "SELECT ui_state FROM cases WHERE id = :id;"
        curr_res = db_client.execute(curr_sql, {"id": case_id})
        curr_row = curr_res.fetchone()
        ui_state_val = curr_row[0] if curr_row else "{}"
        
        db_client.execute(sql, {
            "id": new_case_id,
            "name": payload.name,
            "type": payload.type,
            "ontology_version": payload.ontology_version,
            "created_by": payload.created_by,
            "created_at": created_at,
            "permissions": json.dumps([]),
            "ui_state": ui_state_val
        })
        
        # Duplicate entities
        ent_sql = "SELECT id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history FROM entities WHERE case_id = :case_id;"
        ent_res = db_client.execute(ent_sql, {"case_id": case_id})
        entities = ent_res.fetchall()
        
        # Store id mapping to redirect relationship IDs
        id_mapping = {}
        for ent in entities:
            old_id = ent[0]
            new_id = str(uuid.uuid4())
            id_mapping[old_id] = new_id
            
            ins_ent = """
            INSERT INTO entities (id, case_id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history)
            VALUES (:id, :case_id, :type, :properties, :confidence, :source, :created_by, :created_at, :updated_at, :ai_summary, :tags, :location, :version_history);
            """
            db_client.execute(ins_ent, {
                "id": new_id,
                "case_id": new_case_id,
                "type": ent[1],
                "properties": ent[2],
                "confidence": ent[3],
                "source": ent[4],
                "created_by": ent[5],
                "created_at": ent[6],
                "updated_at": ent[7],
                "ai_summary": ent[8],
                "tags": ent[9],
                "location": ent[10],
                "version_history": ent[11]
            })
            
        # Duplicate relationships
        rel_sql = "SELECT id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated FROM relationships WHERE case_id = :case_id;"
        rel_res = db_client.execute(rel_sql, {"case_id": case_id})
        relationships = rel_res.fetchall()
        
        for rel in relationships:
            old_src = rel[1]
            old_tgt = rel[2]
            # Ensure mapped IDs exist in mapping, else ignore or keep original (if global entity)
            new_src = id_mapping.get(old_src, old_src)
            new_tgt = id_mapping.get(old_tgt, old_tgt)
            new_rel_id = str(uuid.uuid4())
            
            ins_rel = """
            INSERT INTO relationships (id, case_id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated)
            VALUES (:id, :case_id, :source_entity_id, :target_entity_id, :relationship_type, :label, :confidence, :evidence, :created_by, :created_at, :last_updated);
            """
            db_client.execute(ins_rel, {
                "id": new_rel_id,
                "case_id": new_case_id,
                "source_entity_id": new_src,
                "target_entity_id": new_tgt,
                "relationship_type": rel[3],
                "label": rel[4],
                "confidence": rel[5],
                "evidence": rel[6],
                "created_by": rel[7],
                "created_at": rel[8],
                "last_updated": rel[9]
            })
            
        # Duplicated case gets fresh Case Memory
        memory_sql = """
        INSERT INTO case_memory (case_id, context, notes, chat_history)
        VALUES (:case_id, :context, :notes, :chat_history);
        """
        context_data = {
            "case_name": payload.name,
            "case_type": payload.type,
            "goals": ["Identify network entities", "Trace communication vectors"]
        }
        db_client.execute(memory_sql, {
            "case_id": new_case_id,
            "context": json.dumps(context_data),
            "notes": "[]",
            "chat_history": "[]"
        })
        
        return {"status": "success", "new_case_id": new_case_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{case_id}/archive")
def archive_case(case_id: str):
    try:
        # Check current status
        res = db_client.execute("SELECT status FROM cases WHERE id = :id;", {"id": case_id})
        row = res.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
        
        current_status = row[0]
        new_status = "active" if current_status == "archived" else "archived"
        
        db_client.execute("UPDATE cases SET status = :status WHERE id = :id;", {"status": new_status, "id": case_id})
        return {"status": "success", "case_status": new_status}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{case_id}")
def delete_case(case_id: str):
    try:
        # Soft delete: update status to 'deleted'
        db_client.execute("UPDATE cases SET status = 'deleted' WHERE id = :id;", {"id": case_id})
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

