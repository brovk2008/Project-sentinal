import uuid
import json
import time
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from db import db_client
from services.ontology import validate_entity, validate_relationship

router = APIRouter(tags=["Graph v2"])

class EntityCreateSchema(BaseModel):
    type: str
    properties: Dict[str, Any]
    confidence: Optional[float] = 1.0
    source: Optional[str] = "manual"
    created_by: Optional[str] = "analyst"
    tags: Optional[List[str]] = []
    location: Optional[Dict[str, Any]] = None

class RelationshipCreateSchema(BaseModel):
    source_entity_id: str
    target_entity_id: str
    relationship_type: str
    label: Optional[str] = ""
    confidence: Optional[float] = 1.0
    evidence: Optional[List[Dict[str, Any]]] = []
    created_by: Optional[str] = "analyst"

class EntityUpdateSchema(BaseModel):
    properties: Dict[str, Any]
    confidence: Optional[float] = 1.0
    tags: Optional[List[str]] = []
    location: Optional[Dict[str, Any]] = None
    modified_by: Optional[str] = "analyst"
    source: Optional[str] = None
    created_by: Optional[str] = None

class RelationshipUpdateSchema(BaseModel):
    label: Optional[str] = ""
    confidence: Optional[float] = 1.0
    evidence: Optional[List[Dict[str, Any]]] = []
    modified_by: Optional[str] = "analyst"
    created_by: Optional[str] = None

class ResolutionLinkSchema(BaseModel):
    entity_id_1: str
    entity_id_2: str
    status: str
    notes: Optional[str] = ""

@router.get("/")
def get_graph(case_id: str):
    try:
        # Fetch entities
        ent_sql = "SELECT id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history FROM entities WHERE case_id = :case_id;"
        ent_res = db_client.execute(ent_sql, {"case_id": case_id})
        ent_rows = ent_res.fetchall()
        
        entities = []
        for r in ent_rows:
            entities.append({
                "id": r[0],
                "type": r[1],
                "properties": json.loads(r[2]) if r[2] else {},
                "confidence": r[3],
                "source": r[4],
                "created_by": r[5],
                "created_at": r[6],
                "updated_at": r[7],
                "ai_summary": r[8],
                "tags": json.loads(r[9]) if r[9] else [],
                "location": json.loads(r[10]) if r[10] else None,
                "version_history": json.loads(r[11]) if r[11] else []
            })
            
        # Fetch relationships
        rel_sql = "SELECT id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated FROM relationships WHERE case_id = :case_id;"
        rel_res = db_client.execute(rel_sql, {"case_id": case_id})
        rel_rows = rel_res.fetchall()
        
        relationships = []
        for r in rel_rows:
            relationships.append({
                "id": r[0],
                "source_entity_id": r[1],
                "target_entity_id": r[2],
                "relationship_type": r[3],
                "label": r[4],
                "confidence": r[5],
                "evidence": json.loads(r[6]) if r[6] else [],
                "created_by": r[7],
                "created_at": r[8],
                "last_updated": r[9]
            })

        # Fetch hypotheses and merge them as entities of type 'Hypothesis'
        hyp_sql = "SELECT id, statement, confidence, status, created_by, created_at, supporting_evidence, history FROM hypotheses WHERE case_id = :case_id;"
        hyp_res = db_client.execute(hyp_sql, {"case_id": case_id})
        for r in hyp_res.fetchall():
            entities.append({
                "id": r[0],
                "type": "Hypothesis",
                "properties": {
                    "name": r[1],
                    "status": r[3],
                    "supporting_evidence": json.loads(r[6]) if r[6] else [],
                    "history": json.loads(r[7]) if r[7] else []
                },
                "confidence": r[2] if r[2] is not None else 1.0,
                "source": "manual",
                "created_by": r[4],
                "created_at": r[5],
                "updated_at": r[5],
                "ai_summary": None,
                "tags": [],
                "location": None,
                "version_history": []
            })
            
        return {"entities": entities, "relationships": relationships}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/entities")
def create_entity(case_id: str, payload: EntityCreateSchema):
    entity_id = str(uuid.uuid4())
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        # Fetch ontology version for case
        case_sql = "SELECT ontology_version FROM cases WHERE id = :case_id;"
        case_res = db_client.execute(case_sql, {"case_id": case_id})
        case_row = case_res.fetchone()
        ontology_version = case_row[0] if case_row else "crime-analysis-v1"

        # Validate entity type against active ontology
        if not validate_entity(ontology_version, payload.type, payload.properties):
            raise HTTPException(status_code=400, detail=f"Entity type '{payload.type}' is not allowed under ontology '{ontology_version}'")

        # Initialize version history
        initial_history = [{
            "timestamp": now,
            "action": "create",
            "properties": payload.properties,
            "confidence": payload.confidence,
            "modified_by": payload.created_by
        }]
        
        sql = """
        INSERT INTO entities (id, case_id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history)
        VALUES (:id, :case_id, :type, :properties, :confidence, :source, :created_by, :created_at, :updated_at, NULL, :tags, :location, :version_history);
        """
        db_client.execute(sql, {
            "id": entity_id,
            "case_id": case_id,
            "type": payload.type,
            "properties": json.dumps(payload.properties),
            "confidence": payload.confidence,
            "source": payload.source,
            "created_by": payload.created_by,
            "created_at": now,
            "updated_at": now,
            "tags": json.dumps(payload.tags),
            "location": json.dumps(payload.location) if payload.location else None,
            "version_history": json.dumps(initial_history)
        })
        return {"status": "success", "entity_id": entity_id}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/relationships")
def create_relationship(case_id: str, payload: RelationshipCreateSchema):
    rel_id = str(uuid.uuid4())
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        # Fetch ontology version for case
        case_sql = "SELECT ontology_version FROM cases WHERE id = :case_id;"
        case_res = db_client.execute(case_sql, {"case_id": case_id})
        case_row = case_res.fetchone()
        ontology_version = case_row[0] if case_row else "crime-analysis-v1"

        # Lookup source & target entity types
        src_sql = "SELECT type FROM entities WHERE id = :src_id;"
        src_res = db_client.execute(src_sql, {"src_id": payload.source_entity_id})
        src_row = src_res.fetchone()
        src_type = src_row[0] if src_row else None

        tgt_sql = "SELECT type FROM entities WHERE id = :tgt_id;"
        tgt_res = db_client.execute(tgt_sql, {"tgt_id": payload.target_entity_id})
        tgt_row = tgt_res.fetchone()
        tgt_type = tgt_row[0] if tgt_row else None

        if not src_type:
            raise HTTPException(status_code=404, detail=f"Source entity '{payload.source_entity_id}' not found")
        if not tgt_type:
            raise HTTPException(status_code=404, detail=f"Target entity '{payload.target_entity_id}' not found")

        # Validate relationship
        if not validate_relationship(ontology_version, payload.relationship_type, src_type, tgt_type):
            raise HTTPException(
                status_code=400, 
                detail=f"Relationship type '{payload.relationship_type}' is not allowed between source '{src_type}' and target '{tgt_type}' under ontology '{ontology_version}'"
            )

        # Initialize version history
        initial_history = [{
            "timestamp": now,
            "action": "create",
            "label": payload.label,
            "confidence": payload.confidence,
            "modified_by": payload.created_by
        }]

        sql = """
        INSERT INTO relationships (id, case_id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated, version_history)
        VALUES (:id, :case_id, :source_entity_id, :target_entity_id, :relationship_type, :label, :confidence, :evidence, :created_by, :created_at, :last_updated, :version_history);
        """
        db_client.execute(sql, {
            "id": rel_id,
            "case_id": case_id,
            "source_entity_id": payload.source_entity_id,
            "target_entity_id": payload.target_entity_id,
            "relationship_type": payload.relationship_type,
            "label": payload.label,
            "confidence": payload.confidence,
            "evidence": json.dumps(payload.evidence),
            "created_by": payload.created_by,
            "created_at": now,
            "last_updated": now,
            "version_history": json.dumps(initial_history)
        })
        return {"status": "success", "relationship_id": rel_id}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/neighborhood/{entity_id}")
def get_neighborhood(case_id: str, entity_id: str, hops: int = Query(2, ge=1, le=4)):
    try:
        # Load all relationships for traversal
        rel_sql = "SELECT source_entity_id, target_entity_id FROM relationships WHERE case_id = :case_id;"
        rel_res = db_client.execute(rel_sql, {"case_id": case_id})
        rels = rel_res.fetchall()
        
        # Build adjacency list
        adj = {}
        for r in rels:
            src, tgt = r[0], r[1]
            if src not in adj: adj[src] = set()
            if tgt not in adj: adj[tgt] = set()
            adj[src].add(tgt)
            adj[tgt].add(src)
            
        # BFS traversal up to hops depth
        visited = {entity_id}
        queue = [(entity_id, 0)]
        
        while queue:
            node, depth = queue.pop(0)
            if depth < hops:
                for neighbor in adj.get(node, []):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append((neighbor, depth + 1))
                        
        # Fetch entities in visited set
        visited_list = list(visited)
        
        entities = []
        if visited_list:
            param_dict = {}
            placeholders_list = []
            for idx, val in enumerate(visited_list):
                param_key = f"v{idx}"
                placeholders_list.append(f":{param_key}")
                param_dict[param_key] = val
            placeholders = ", ".join(placeholders_list)
            
            ent_sql = f"SELECT id, type, properties, confidence, location FROM entities WHERE id IN ({placeholders});"
            ent_res = db_client.execute(ent_sql, param_dict)
            for r in ent_res.fetchall():
                entities.append({
                    "id": r[0],
                    "type": r[1],
                    "properties": json.loads(r[2]) if r[2] else {},
                    "confidence": r[3],
                    "location": json.loads(r[4]) if r[4] else None
                })
                
        # Fetch matching relationships between visited nodes
        relationships = []
        if visited_list:
            param_dict = {}
            placeholders_list = []
            for idx, val in enumerate(visited_list):
                param_key = f"v{idx}"
                placeholders_list.append(f":{param_key}")
                param_dict[param_key] = val
            placeholders = ", ".join(placeholders_list)
            
            rel_sql = f"SELECT id, source_entity_id, target_entity_id, relationship_type, label, confidence FROM relationships WHERE source_entity_id IN ({placeholders}) AND target_entity_id IN ({placeholders});"
            rel_res = db_client.execute(rel_sql, param_dict)
            for r in rel_res.fetchall():
                relationships.append({
                    "id": r[0],
                    "source_entity_id": r[1],
                    "target_entity_id": r[2],
                    "relationship_type": r[3],
                    "label": r[4],
                    "confidence": r[5]
                })
                
        return {"entities": entities, "relationships": relationships}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/path")
def get_path(case_id: str, source: str, target: str, max_hops: int = Query(6, ge=1, le=10)):
    try:
        # BFS path finder
        rel_sql = "SELECT source_entity_id, target_entity_id FROM relationships WHERE case_id = :case_id;"
        rel_res = db_client.execute(rel_sql, {"case_id": case_id})
        rels = rel_res.fetchall()
        
        adj = {}
        for r in rels:
            src, tgt = r[0], r[1]
            if src not in adj: adj[src] = set()
            if tgt not in adj: adj[tgt] = set()
            adj[src].add(tgt)
            adj[tgt].add(src)
            
        if source not in adj or target not in adj:
            return {"path": [], "found": False}
            
        queue = [[source]]
        visited = {source}
        
        while queue:
            path = queue.pop(0)
            node = path[-1]
            if node == target:
                return {"path": path, "found": True}
            if len(path) - 1 < max_hops:
                for neighbor in adj.get(node, []):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        new_path = list(path)
                        new_path.append(neighbor)
                        queue.append(new_path)
                        
        return {"path": [], "found": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class HypothesisCreateSchema(BaseModel):
    statement: str
    status: Optional[str] = "open"
    created_by: Optional[str] = "analyst"

class EvidenceLinkSchema(BaseModel):
    relationship_id: str
    supports: bool

@router.get("/hypotheses")
def get_hypotheses(case_id: str):
    try:
        sql = "SELECT id, statement, supporting_evidence, confidence, status, created_by, created_at, history FROM hypotheses WHERE case_id = :case_id;"
        res = db_client.execute(sql, {"case_id": case_id})
        rows = res.fetchall()
        
        hypotheses = []
        for r in rows:
            hypotheses.append({
                "id": r[0],
                "statement": r[1],
                "supporting_evidence": json.loads(r[2]) if r[2] else [],
                "confidence": r[3],
                "status": r[4],
                "created_by": r[5],
                "created_at": r[6],
                "history": json.loads(r[7]) if r[7] else []
            })
        return hypotheses
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/hypotheses")
def create_hypothesis(case_id: str, payload: HypothesisCreateSchema):
    hyp_id = str(uuid.uuid4())
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        sql = """
        INSERT INTO hypotheses (id, case_id, statement, supporting_evidence, confidence, status, created_by, created_at, history)
        VALUES (:id, :case_id, :statement, '[]', 1.0, :status, :created_by, :created_at, '[]');
        """
        db_client.execute(sql, {
            "id": hyp_id,
            "case_id": case_id,
            "statement": payload.statement,
            "status": payload.status,
            "created_by": payload.created_by,
            "created_at": now
        })
        return {"status": "success", "hypothesis_id": hyp_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/hypotheses/{hypothesis_id}/evidence")
def link_evidence(case_id: str, hypothesis_id: str, payload: EvidenceLinkSchema):
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        # 1. Fetch current hypothesis
        sql = "SELECT supporting_evidence, confidence, history, statement FROM hypotheses WHERE id = :id;"
        res = db_client.execute(sql, {"id": hypothesis_id})
        row = res.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hypothesis not found")
            
        supporting_evidence = json.loads(row[0]) if row[0] else []
        old_confidence = row[1]
        history = json.loads(row[2]) if row[2] else []
        statement = row[3]
        
        # Append new evidence link
        supporting_evidence.append({
            "relationship_id": payload.relationship_id,
            "supports": payload.supports
        })
        
        # 2. Recalculate confidence score
        # Fetch confidence for all relationships in list
        supporting_sum = 0.0
        contradicting_sum = 0.0
        
        for item in supporting_evidence:
            rel_id = item["relationship_id"]
            supports = item["supports"]
            
            # Query relationship confidence
            rel_sql = "SELECT confidence FROM relationships WHERE id = :rel_id;"
            rel_res = db_client.execute(rel_sql, {"rel_id": rel_id})
            rel_row = rel_res.fetchone()
            rel_conf = rel_row[0] if rel_row else 1.0
            
            if supports:
                supporting_sum += rel_conf
            else:
                contradicting_sum += rel_conf
                
        count = len(supporting_evidence)
        new_confidence = (supporting_sum - contradicting_sum) / max(1, count)
        new_confidence = max(0.0, min(1.0, new_confidence))
        
        # Append old state to history log
        history.append({
            "confidence": old_confidence,
            "timestamp": now
        })
        
        # 3. Update database
        update_sql = """
        UPDATE hypotheses 
        SET supporting_evidence = :supporting_evidence, confidence = :confidence, history = :history 
        WHERE id = :id;
        """
        db_client.execute(update_sql, {
            "id": hypothesis_id,
            "supporting_evidence": json.dumps(supporting_evidence),
            "confidence": new_confidence,
            "history": json.dumps(history)
        })
        
        return {"status": "success", "new_confidence": new_confidence}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

def get_match_reason(e1_type: str, e1_props: dict, e2_type: str, e2_props: dict) -> Optional[str]:
    if e1_type == "Hypothesis" or e2_type == "Hypothesis":
        return None
    if e1_type != e2_type:
        return None
        
    def normalize(val):
        if val is None:
            return ""
        s = str(val).strip().lower()
        return "".join(c for c in s if c.isalnum())

    if e1_type == "Person":
        name1 = e1_props.get("name")
        name2 = e2_props.get("name")
        national_id1 = e1_props.get("national_id")
        national_id2 = e2_props.get("national_id")
        
        if national_id1 and national_id2 and normalize(national_id1) == normalize(national_id2):
            return f"Matching National ID: {national_id1}"
        
        if name1 and name2:
            n1 = normalize(name1)
            n2 = normalize(name2)
            if n1 and n1 == n2:
                return f"Matching Person Name: {name1}"
                
    elif e1_type == "Phone":
        num1 = e1_props.get("number")
        num2 = e2_props.get("number")
        imei1 = e1_props.get("IMEI") or e1_props.get("imei")
        imei2 = e2_props.get("IMEI") or e2_props.get("imei")
        
        if num1 and num2 and normalize(num1) == normalize(num2):
            return f"Matching Phone Number: {num1}"
        if imei1 and imei2 and normalize(imei1) == normalize(imei2):
            return f"Matching IMEI: {imei1}"
            
    elif e1_type == "BankAccount":
        acc1 = e1_props.get("account_number") or e1_props.get("accountNumber")
        acc2 = e2_props.get("account_number") or e2_props.get("accountNumber")
        if acc1 and acc2 and normalize(acc1) == normalize(acc2):
            return f"Matching Bank Account Number: {acc1}"
            
    elif e1_type == "Vehicle":
        reg1 = e1_props.get("registration")
        reg2 = e2_props.get("registration")
        if reg1 and reg2 and normalize(reg1) == normalize(reg2):
            return f"Matching Vehicle Registration: {reg1}"
            
    elif e1_type == "Customer":
        email1 = e1_props.get("email")
        email2 = e2_props.get("email")
        phone1 = e1_props.get("phone_number")
        phone2 = e2_props.get("phone_number")
        
        if email1 and email2 and normalize(email1) == normalize(email2):
            return f"Matching Customer Email: {email1}"
        if phone1 and phone2 and normalize(phone1) == normalize(phone2):
            return f"Matching Customer Phone: {phone1}"
            
    elif e1_type == "Device":
        dev1 = e1_props.get("device_id")
        dev2 = e2_props.get("device_id")
        if dev1 and dev2 and normalize(dev1) == normalize(dev2):
            return f"Matching Device ID: {dev1}"
            
    elif e1_type == "IPAddress":
        ip1 = e1_props.get("ip")
        ip2 = e2_props.get("ip")
        if ip1 and ip2 and normalize(ip1) == normalize(ip2):
            return f"Matching IP Address: {ip1}"

    elif e1_type in ("Organization", "Merchant"):
        name1 = e1_props.get("name")
        name2 = e2_props.get("name")
        if name1 and name2 and normalize(name1) == normalize(name2):
            return f"Matching Name: {name1}"

    return None

@router.put("/entities/{entity_id}")
def update_entity(case_id: str, entity_id: str, payload: EntityUpdateSchema):
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        case_sql = "SELECT ontology_version FROM cases WHERE id = :case_id;"
        case_res = db_client.execute(case_sql, {"case_id": case_id})
        case_row = case_res.fetchone()
        if not case_row:
            raise HTTPException(status_code=404, detail="Case not found")
        ontology_version = case_row[0]

        ent_sql = "SELECT type, version_history, source, created_by FROM entities WHERE id = :id AND case_id = :case_id;"
        ent_res = db_client.execute(ent_sql, {"id": entity_id, "case_id": case_id})
        ent_row = ent_res.fetchone()
        if not ent_row:
            raise HTTPException(status_code=404, detail="Entity not found")
        entity_type, hist_str, old_source, old_created_by = ent_row[0], ent_row[1], ent_row[2], ent_row[3]

        if not validate_entity(ontology_version, entity_type, payload.properties):
            raise HTTPException(status_code=400, detail=f"Properties violate ontology '{ontology_version}' rules for type '{entity_type}'")

        history = json.loads(hist_str) if hist_str else []
        history.append({
            "timestamp": now,
            "action": "update",
            "properties": payload.properties,
            "confidence": payload.confidence,
            "modified_by": payload.modified_by
        })

        new_source = payload.source if payload.source is not None else old_source
        new_created_by = payload.created_by if payload.created_by is not None else old_created_by

        sql = """
        UPDATE entities
        SET properties = :properties, confidence = :confidence, tags = :tags, location = :location, 
            updated_at = :updated_at, version_history = :version_history, source = :source, created_by = :created_by
        WHERE id = :id AND case_id = :case_id;
        """
        db_client.execute(sql, {
            "id": entity_id,
            "case_id": case_id,
            "properties": json.dumps(payload.properties),
            "confidence": payload.confidence,
            "tags": json.dumps(payload.tags),
            "location": json.dumps(payload.location) if payload.location else None,
            "updated_at": now,
            "version_history": json.dumps(history),
            "source": new_source,
            "created_by": new_created_by
        })
        return {"status": "success", "entity_id": entity_id}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/relationships/{relationship_id}")
def update_relationship(case_id: str, relationship_id: str, payload: RelationshipUpdateSchema):
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        rel_sql = "SELECT version_history, created_by FROM relationships WHERE id = :id AND case_id = :case_id;"
        rel_res = db_client.execute(rel_sql, {"id": relationship_id, "case_id": case_id})
        rel_row = rel_res.fetchone()
        if not rel_row:
            raise HTTPException(status_code=404, detail="Relationship not found")
        hist_str, old_created_by = rel_row[0], rel_row[1]

        history = json.loads(hist_str) if hist_str else []
        history.append({
            "timestamp": now,
            "action": "update",
            "label": payload.label,
            "confidence": payload.confidence,
            "evidence": payload.evidence,
            "modified_by": payload.modified_by
        })

        new_created_by = payload.created_by if payload.created_by is not None else old_created_by

        sql = """
        UPDATE relationships
        SET label = :label, confidence = :confidence, evidence = :evidence, last_updated = :last_updated, 
            version_history = :version_history, created_by = :created_by
        WHERE id = :id AND case_id = :case_id;
        """
        db_client.execute(sql, {
            "id": relationship_id,
            "case_id": case_id,
            "label": payload.label,
            "confidence": payload.confidence,
            "evidence": json.dumps(payload.evidence),
            "last_updated": now,
            "version_history": json.dumps(history),
            "created_by": new_created_by
        })
        return {"status": "success", "relationship_id": relationship_id}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/entities/{entity_id}")
def delete_entity(case_id: str, entity_id: str):
    try:
        db_client.execute("DELETE FROM relationships WHERE case_id = :case_id AND (source_entity_id = :ent_id OR target_entity_id = :ent_id);", {"case_id": case_id, "ent_id": entity_id})
        db_client.execute("DELETE FROM entities WHERE id = :id AND case_id = :case_id;", {"id": entity_id, "case_id": case_id})
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/relationships/{relationship_id}")
def delete_relationship(case_id: str, relationship_id: str):
    try:
        db_client.execute("DELETE FROM relationships WHERE id = :id AND case_id = :case_id;", {"id": relationship_id, "case_id": case_id})
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/resolution")
def get_entity_resolutions(case_id: str):
    try:
        case_res = db_client.execute("SELECT id, name FROM cases;")
        case_map = {r[0]: r[1] for r in case_res.fetchall()}
        
        curr_res = db_client.execute(
            "SELECT id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location FROM entities WHERE case_id = :case_id;",
            {"case_id": case_id}
        )
        curr_entities = []
        for r in curr_res.fetchall():
            curr_entities.append({
                "id": r[0],
                "type": r[1],
                "properties": json.loads(r[2]) if r[2] else {},
                "confidence": r[3],
                "source": r[4],
                "created_by": r[5],
                "created_at": r[6],
                "updated_at": r[7],
                "ai_summary": r[8],
                "tags": json.loads(r[9]) if r[9] else [],
                "location": json.loads(r[10]) if r[10] else None
            })
            
        other_res = db_client.execute(
            "SELECT id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, case_id FROM entities WHERE case_id != :case_id;",
            {"case_id": case_id}
        )
        other_entities = []
        for r in other_res.fetchall():
            other_entities.append({
                "id": r[0],
                "type": r[1],
                "properties": json.loads(r[2]) if r[2] else {},
                "confidence": r[3],
                "source": r[4],
                "created_by": r[5],
                "created_at": r[6],
                "updated_at": r[7],
                "ai_summary": r[8],
                "tags": json.loads(r[9]) if r[9] else [],
                "location": json.loads(r[10]) if r[10] else None,
                "case_id": r[11]
            })
            
        res_res = db_client.execute("SELECT entity_id_1, entity_id_2, status, notes FROM entity_resolutions;")
        resolution_map = {}
        for r in res_res.fetchall():
            resolution_map[(r[0], r[1])] = (r[2], r[3])
            resolution_map[(r[1], r[0])] = (r[2], r[3])
            
        matches = []
        for e1 in curr_entities:
            for e2 in other_entities:
                reason = get_match_reason(e1["type"], e1["properties"], e2["type"], e2["properties"])
                if reason:
                    status, notes = resolution_map.get((e1["id"], e2["id"]), ("unresolved", ""))
                    matches.append({
                        "source_entity": e1,
                        "target_entity": e2,
                        "match_reason": reason,
                        "target_case_id": e2["case_id"],
                        "target_case_name": case_map.get(e2["case_id"], "Unknown Case"),
                        "resolution_status": status,
                        "notes": notes
                    })
        return matches
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/resolution/link")
def create_resolution_link(case_id: str, payload: ResolutionLinkSchema):
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        check_sql = """
        SELECT id FROM entity_resolutions 
        WHERE (entity_id_1 = :e1 AND entity_id_2 = :e2) 
           OR (entity_id_1 = :e2 AND entity_id_2 = :e1);
        """
        check_res = db_client.execute(check_sql, {"e1": payload.entity_id_1, "e2": payload.entity_id_2})
        row = check_res.fetchone()
        
        if row:
            res_id = row[0]
            update_sql = """
            UPDATE entity_resolutions
            SET status = :status, resolved_at = :resolved_at, notes = :notes
            WHERE id = :id;
            """
            db_client.execute(update_sql, {
                "id": res_id,
                "status": payload.status,
                "resolved_at": now,
                "notes": payload.notes
            })
        else:
            res_id = str(uuid.uuid4())
            insert_sql = """
            INSERT INTO entity_resolutions (id, case_id, entity_id_1, entity_id_2, status, resolved_by, resolved_at, notes)
            VALUES (:id, :case_id, :entity_id_1, :entity_id_2, :status, 'analyst', :resolved_at, :notes);
            """
            db_client.execute(insert_sql, {
                "id": res_id,
                "case_id": case_id,
                "entity_id_1": payload.entity_id_1,
                "entity_id_2": payload.entity_id_2,
                "status": payload.status,
                "resolved_at": now,
                "notes": payload.notes
            })
            
        return {"status": "success", "resolution_id": res_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
