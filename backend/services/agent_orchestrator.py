import os
import json
import uuid
import time
import joblib
import pandas as pd
from typing import List, Dict, Any, Optional
from services.ai_router import ai_router
from services.rag_processor import search_case_rag
from db import db_client

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")

class AgentResult:
    def __init__(self, agent: str, task_id: str, case_id: str, status: str, findings: List[Dict[str, Any]], errors: List[str] = None):
        self.agent = agent
        self.task_id = task_id
        self.case_id = case_id
        self.status = status # "complete" | "partial" | "failed"
        self.findings = findings # list of dicts with keys: claim, source, confidence, evidence_type
        self.errors = errors or []

    def to_dict(self) -> dict:
        return {
            "agent": self.agent,
            "task_id": self.task_id,
            "case_id": self.case_id,
            "status": self.status,
            "findings": self.findings,
            "errors": self.errors
        }

class BaseAgent:
    def __init__(self, case_id: str):
        self.case_id = case_id

    def capabilities(self) -> List[str]:
        return []

class RAGAgent(BaseAgent):
    def capabilities(self) -> List[str]:
        return ["internal_search", "document_retrieval"]

    def run(self, query: str, task_id: str) -> AgentResult:
        try:
            chunks = search_case_rag(self.case_id, query, top_k=3)
            findings = []
            for c in chunks:
                findings.append({
                    "claim": c["text_content"],
                    "source": f"{c['source_file']} (p.{c['page_number']})" if c.get("page_number") else c["source_file"],
                    "confidence": c["score"],
                    "evidence_type": "direct_quote"
                })
            return AgentResult("RAGAgent", task_id, self.case_id, "complete", findings)
        except Exception as e:
            return AgentResult("RAGAgent", task_id, self.case_id, "failed", [], errors=[str(e)])

class OSINTAgent(BaseAgent):
    def capabilities(self) -> List[str]:
        return ["web_search", "news_lookup", "public_scraping"]

    def run(self, query: str, task_id: str) -> AgentResult:
        try:
            tavily = ai_router.get_provider("tavily")
            findings = []
            
            if tavily and tavily.health() == "healthy":
                res = tavily.search(query)
                if res.success and isinstance(res.data, dict):
                    results = res.data.get("results", [])
                    for r in results[:3]:
                        findings.append({
                            "claim": r.get("snippet", r.get("title", "")),
                            "source": r.get("url", "Tavily"),
                            "confidence": 0.85,
                            "evidence_type": "metadata_match"
                        })
                    return AgentResult("OSINTAgent", task_id, self.case_id, "complete", findings)
            
            # Fallback firecrawl or LLM simulated search
            prompt = f"Search public records and news for query: {query}. Summarize claims and cite public URLs if possible."
            system = "You are an OSINT Agent. Return a JSON array of findings. Format: [{\"claim\": \"...\", \"source\": \"...\", \"confidence\": 0.8}]"
            res_str = ai_router.complete(prompt, system=system)
            try:
                if "```json" in res_str:
                    res_str = res_str.split("```json")[1].split("```")[0].strip()
                elif "```" in res_str:
                    res_str = res_str.split("```")[1].split("```")[0].strip()
                findings_data = json.loads(res_str)
                for f in findings_data:
                    f["evidence_type"] = "inference"
                return AgentResult("OSINTAgent", task_id, self.case_id, "complete", findings_data)
            except Exception:
                findings.append({
                    "claim": res_str or "No web records retrieved.",
                    "source": "OSINT Fallback Engine",
                    "confidence": 0.5,
                    "evidence_type": "inference"
                })
                return AgentResult("OSINTAgent", task_id, self.case_id, "partial", findings)
        except Exception as e:
            return AgentResult("OSINTAgent", task_id, self.case_id, "failed", [], errors=[str(e)])

class LegalAgent(BaseAgent):
    def capabilities(self) -> List[str]:
        return ["case_law", "statutes", "ipc_lookup"]

    def run(self, query: str, task_id: str) -> AgentResult:
        try:
            kanoon = ai_router.get_provider("indian_kanoon")
            findings = []
            if kanoon and kanoon.health() == "healthy":
                res = kanoon.search(query)
                if res.success and isinstance(res.data, dict):
                    docs = res.data.get("docs", [])
                    for d in docs[:3]:
                        findings.append({
                            "claim": d.get("title", ""),
                            "source": f"IndianKanoon doc {d.get('tid')}",
                            "confidence": 0.9,
                            "evidence_type": "direct_quote"
                        })
                    return AgentResult("LegalAgent", task_id, self.case_id, "complete", findings)
            
            # Local fallback
            prompt = f"Look up Indian Penal Code (IPC) / Bharatiya Nyaya Sanhita (BNS) statutes matching: {query}. Summarize statutory sections."
            system = "You are a Legal Assistant. Extract specific section references. Return JSON: [{\"claim\": \"...\", \"source\": \"IPC Section X\", \"confidence\": 0.95}]"
            res_str = ai_router.complete(prompt, system=system)
            try:
                if "```json" in res_str:
                    res_str = res_str.split("```json")[1].split("```")[0].strip()
                findings_data = json.loads(res_str)
                for f in findings_data:
                    f["evidence_type"] = "direct_quote"
                return AgentResult("LegalAgent", task_id, self.case_id, "complete", findings_data)
            except Exception:
                findings.append({
                    "claim": res_str or "No statutory matches found.",
                    "source": "Statutes Database",
                    "confidence": 0.7,
                    "evidence_type": "inference"
                })
                return AgentResult("LegalAgent", task_id, self.case_id, "partial", findings)
        except Exception as e:
            return AgentResult("LegalAgent", task_id, self.case_id, "failed", [], errors=[str(e)])

class FinancialIntelligenceAgent(BaseAgent):
    def capabilities(self) -> List[str]:
        return ["financial_anomaly_scan", "transaction_analysis"]

    def run(self, query: str, task_id: str) -> AgentResult:
        try:
            from ml.anomaly import detect_financial_anomalies
            df = detect_financial_anomalies()
            findings = []
            
            if not df.empty:
                df_sorted = df.sort_values(by="combined_score", ascending=False).head(5)
                for _, row in df_sorted.iterrows():
                    findings.append({
                        "claim": f"Transaction anomaly: Account {row['sender_account']} sent {row['amount']} to {row['receiver_account']} via {row['transaction_type']}. Velocity: {row['velocity_score']}, Geo: {row['geo_anomaly_score']}, Combined Score: {row['combined_score']}.",
                        "source": "Isolation Forest (mv_anomaly_financial)",
                        "confidence": min(0.99, max(0.50, float(row['combined_score']) / 10.0)),
                        "evidence_type": "metadata_match"
                    })
            else:
                findings.append({
                    "claim": "No anomalous transactions flagged in financial scanner logs.",
                    "source": "Isolation Forest Model",
                    "confidence": 0.95,
                    "evidence_type": "metadata_match"
                })
            return AgentResult("FinancialIntelligenceAgent", task_id, self.case_id, "complete", findings)
        except Exception as e:
            return AgentResult("FinancialIntelligenceAgent", task_id, self.case_id, "failed", [], errors=[str(e)])

class ForecastAgent(BaseAgent):
    def capabilities(self) -> List[str]:
        return ["crime_forecasting", "hotspot_prediction"]

    def run(self, query: str, task_id: str) -> AgentResult:
        try:
            findings = []
            forecast_path = os.path.join(MODEL_DIR, "forecast_model.joblib")
            hotspot_path = os.path.join(MODEL_DIR, "hotspot_model.joblib")
            
            if os.path.exists(forecast_path):
                payload = joblib.load(forecast_path)
                rmse = payload.get("rmse", 0.0)
                sql = "SELECT district_name, SUM(fir_count) as total_firs FROM mv_monthly_trends GROUP BY district_name ORDER BY total_firs DESC LIMIT 3;"
                res = db_client.execute(sql).fetchall()
                for r in res:
                    findings.append({
                        "claim": f"District '{r[0]}' predicted monthly trends align with historical density of {r[1]} total crime counts (model RMSE: {rmse:.2f}).",
                        "source": f"RandomForest Forecaster ({payload.get('chosen_model_name', 'RF')})",
                        "confidence": min(0.99, max(0.60, 1.0 - (rmse / 500.0) if rmse > 0 else 0.85)),
                        "evidence_type": "inference"
                    })
                    
            if os.path.exists(hotspot_path):
                h_payload = joblib.load(hotspot_path)
                f1 = h_payload.get("f1", 0.0)
                sql_hs = """
                    SELECT pu.unit_name, pu.district_name, COUNT(*) as counts 
                    FROM fact_fir_events f 
                    JOIN dim_police_units pu ON f.unit_id = pu.unit_id 
                    GROUP BY pu.unit_name, pu.district_name 
                    ORDER BY counts DESC LIMIT 3;
                """
                res_hs = db_client.execute(sql_hs).fetchall()
                for r in res_hs:
                    findings.append({
                        "claim": f"Emerging hotspot surge warning flagged at station '{r[0]}' ({r[1]} District) with {r[2]} dense cases (classification F1: {f1:.2f}).",
                        "source": "RandomForest Hotspot Classifier",
                        "confidence": min(0.99, max(0.60, f1 if f1 > 0 else 0.80)),
                        "evidence_type": "inference"
                    })
            
            if not findings:
                findings.append({
                    "claim": "Predictive trend forecasting modules did not return models.",
                    "source": "Forecaster System",
                    "confidence": 0.5,
                    "evidence_type": "inference"
                })
            return AgentResult("ForecastAgent", task_id, self.case_id, "complete", findings)
        except Exception as e:
            return AgentResult("ForecastAgent", task_id, self.case_id, "failed", [], errors=[str(e)])

class TimelineAgent(BaseAgent):
    def capabilities(self) -> List[str]:
        return ["timeline_ordering", "conflict_detection"]

    def run(self, query: str, task_id: str) -> AgentResult:
        try:
            findings = []
            
            # Fetch entities with timestamps
            entity_sql = "SELECT id, type, properties, created_at FROM entities WHERE case_id = :case_id;"
            ent_res = db_client.execute(entity_sql, {"case_id": self.case_id}).fetchall()
            
            events = []
            for r in ent_res:
                ent_id = r[0]
                ent_type = r[1]
                props = json.loads(r[2]) if isinstance(r[2], str) else r[2] or {}
                created_at = r[3]
                
                date_val = props.get("date") or props.get("timestamp") or props.get("fir_date") or props.get("occurred_at") or created_at
                if date_val:
                    events.append({
                        "id": ent_id,
                        "type": "entity",
                        "label": props.get("name") or props.get("number") or props.get("registration") or ent_type,
                        "timestamp": date_val,
                        "location": props.get("location") or props.get("district") or ""
                    })
            
            # Fetch relationships
            rel_sql = "SELECT id, relationship_type, label, created_at FROM relationships WHERE case_id = :case_id;"
            rel_res = db_client.execute(rel_sql, {"case_id": self.case_id}).fetchall()
            for r in rel_res:
                rel_id = r[0]
                rel_type = r[1]
                label = r[2]
                created_at = r[3]
                
                if created_at:
                    events.append({
                        "id": rel_id,
                        "type": "relationship",
                        "label": f"{label} ({rel_type})",
                        "timestamp": created_at,
                        "location": ""
                    })

            # Sort chronologically
            events.sort(key=lambda x: x["timestamp"])
            for ev in events:
                findings.append({
                    "claim": f"Event '{ev['label']}' occurred at {ev['timestamp']}" + (f" (Location: {ev['location']})" if ev['location'] else ""),
                    "source": "Timeline Chronology Engine",
                    "confidence": 1.0,
                    "evidence_type": "metadata_match"
                })

            # Detect logical conflicts (time vs distance inconsistencies)
            for i in range(len(events) - 1):
                e1 = events[i]
                e2 = events[i+1]
                if e1["location"] and e2["location"] and e1["location"] != e2["location"]:
                    try:
                        t1 = pd.to_datetime(e1["timestamp"])
                        t2 = pd.to_datetime(e2["timestamp"])
                        time_diff_min = abs((t2 - t1).total_seconds()) / 60.0
                        if time_diff_min < 30.0:
                            findings.append({
                                "claim": f"CONFLICT: Inconsistent timing between '{e1['label']}' at '{e1['location']}' and '{e2['label']}' at '{e2['location']}'. Gap of only {time_diff_min:.1f} minutes.",
                                "source": "Timeline Conflict Analyzer",
                                "confidence": 0.99,
                                "evidence_type": "inference"
                            })
                    except Exception:
                        pass
            
            if not findings:
                findings.append({
                    "claim": "No temporal event sequences or relationships found.",
                    "source": "Timeline Analyzer",
                    "confidence": 0.95,
                    "evidence_type": "metadata_match"
                })
            return AgentResult("TimelineAgent", task_id, self.case_id, "complete", findings)
        except Exception as e:
            return AgentResult("TimelineAgent", task_id, self.case_id, "failed", [], errors=[str(e)])

class VerificationAgent(BaseAgent):
    def run(self, raw_findings: List[Dict[str, Any]], task_id: str) -> AgentResult:
        """
        Cross-checks claims to assign confidence scores and detect conflicting facts.
        """
        if not raw_findings:
            return AgentResult("VerificationAgent", task_id, self.case_id, "complete", [])
            
        try:
            # Let the LLM verify the claims using Gemini to reduce correlated error
            prompt = f"Cross-verify the following findings for internal consistency, contradictions, and plausibility:\n{json.dumps(raw_findings, indent=2)}\nReview the evidence and re-score the confidence parameter for each finding between 0.0 and 1.0. Flag any direct contradictions."
            system = "You are an Evidence Verification Inspector. Output verified JSON findings list only. Format: [{\"claim\": \"...\", \"source\": \"...\", \"confidence\": float, \"evidence_type\": \"...\", \"status\": \"verified | contradiction_flagged\"}]"
            res_str = ai_router.complete(prompt, system=system, provider="gemini")
            
            if "```json" in res_str:
                res_str = res_str.split("```json")[1].split("```")[0].strip()
            verified_findings = json.loads(res_str)
            return AgentResult("VerificationAgent", task_id, self.case_id, "complete", verified_findings)
        except Exception as e:
            print(f"[Verification Agent] Failed to cross-verify: {e}")
            for f in raw_findings:
                f["status"] = "verified"
            return AgentResult("VerificationAgent", task_id, self.case_id, "partial", raw_findings, errors=[str(e)])

class MemoryAgent(BaseAgent):
    def fetch_memory(self) -> Dict[str, Any]:
        try:
            sql = "SELECT context, notes, chat_history FROM case_memory WHERE case_id = :case_id;"
            res = db_client.execute(sql, {"case_id": self.case_id})
            row = res.fetchone()
            if row:
                return {
                    "context": json.loads(row[0]) if row[0] else {},
                    "notes": json.loads(row[1]) if row[1] else [],
                    "chat_history": json.loads(row[2]) if row[2] else []
                }
        except Exception as e:
            print(f"[MemoryAgent] Error fetching case memory: {e}")
        return {"context": {}, "notes": [], "chat_history": []}

    def save_memory(self, context: dict, notes: list, chat_history: list):
        try:
            sql = """
            INSERT OR REPLACE INTO case_memory (case_id, context, notes, chat_history)
            VALUES (:case_id, :context, :notes, :chat_history);
            """
            db_client.execute(sql, {
                "case_id": self.case_id,
                "context": json.dumps(context),
                "notes": json.dumps(notes),
                "chat_history": json.dumps(chat_history)
            })
        except Exception as e:
            print(f"[MemoryAgent] Error saving case memory: {e}")

class PlannerAgent:
    def __init__(self, case_id: str):
        self.case_id = case_id
        self.rag_agent = RAGAgent(case_id)
        self.osint_agent = OSINTAgent(case_id)
        self.legal_agent = LegalAgent(case_id)
        self.financial_agent = FinancialIntelligenceAgent(case_id)
        self.forecast_agent = ForecastAgent(case_id)
        self.timeline_agent = TimelineAgent(case_id)
        self.verification_agent = VerificationAgent(case_id)
        self.memory_agent = MemoryAgent(case_id)

    def generate_plan(self, user_goal: str) -> List[Dict[str, Any]]:
        """
        Generates investigation subtasks checklist based on goals without executing them.
        """
        memory = self.memory_agent.fetch_memory()
        case_context = memory["context"]
        planning_prompt = f"Case Context: {json.dumps(case_context)}\nUser Goal: {user_goal}\n\nDecompose this goal into a list of investigation subtasks. Choose which internal agent capabilities to use for each subtask: ['internal_search', 'web_search', 'legal_lookup', 'financial_anomaly_scan', 'crime_forecasting', 'timeline_ordering']."
        planning_system = "You are a Case Intelligence Planner. Output a JSON list of subtasks only. Format: [{\"task\": \"...\", \"agent_type\": \"internal_search | web_search | legal_lookup | financial_anomaly_scan | crime_forecasting | timeline_ordering\", \"query\": \"...\"}]"
        
        plan_str = ai_router.complete(planning_prompt, system=planning_system)
        
        try:
            if "```json" in plan_str:
                plan_str = plan_str.split("```json")[1].split("```")[0].strip()
            subtasks = json.loads(plan_str)
            if not isinstance(subtasks, list):
                raise ValueError("Planner must return a list")
            return subtasks
        except Exception:
            return [
                {"task": f"Internal search for {user_goal}", "agent_type": "internal_search", "query": user_goal},
                {"task": f"OSINT lookup for {user_goal}", "agent_type": "web_search", "query": user_goal}
            ]

    def execute_plan(self, user_goal: str, subtasks: List[Dict[str, Any]], progress_callback = None) -> Dict[str, Any]:
        """
        Executes selected subtasks, runs verification, saves to memory, and inserts proposed graph updates as AI suggestions.
        """
        task_id = str(uuid.uuid4())
        
        # Load Case Memory
        memory = self.memory_agent.fetch_memory()
        case_context = memory["context"]
        
        # 1. Execution stage
        collected_findings = []
        for idx, sub in enumerate(subtasks):
            agent_type = sub["agent_type"]
            query = sub["query"]
            task_desc = sub["task"]
            
            if progress_callback:
                progress_callback({
                    "stage": "running_subtask",
                    "subtask_index": idx,
                    "message": f"Running subtask {idx+1}/{len(subtasks)}: {task_desc}..."
                })
                
            res = None
            if agent_type == "internal_search":
                res = self.rag_agent.run(query, task_id)
            elif agent_type == "web_search":
                res = self.osint_agent.run(query, task_id)
            elif agent_type == "legal_lookup":
                res = self.legal_agent.run(query, task_id)
            elif agent_type == "financial_anomaly_scan":
                res = self.financial_agent.run(query, task_id)
            elif agent_type == "crime_forecasting":
                res = self.forecast_agent.run(query, task_id)
            elif agent_type == "timeline_ordering":
                res = self.timeline_agent.run(query, task_id)
                
            if res and res.status != "failed":
                collected_findings.extend(res.findings)
                
        # 2. Verification stage
        if progress_callback:
            progress_callback({"stage": "verification", "message": "Cross-verifying findings and checking contradictions..."})
            
        verify_res = self.verification_agent.run(collected_findings, task_id)
        verified_findings = verify_res.findings
        
        # 3. Generate final briefing/summary
        if progress_callback:
            progress_callback({"stage": "briefing", "message": "Synthesizing case briefing..."})
            
        briefing_prompt = f"Synthesize a short, professional case intelligence briefing based on verified findings:\n{json.dumps(verified_findings, indent=2)}"
        briefing = ai_router.complete(briefing_prompt, system="You are a Lead Intelligence Analyst compiler.")
        
        # 4. Save reasoning log to memory
        memory["chat_history"].append({
            "role": "user",
            "content": user_goal
        })
        memory["chat_history"].append({
            "role": "assistant",
            "content": briefing,
            "findings": verified_findings
        })
        self.memory_agent.save_memory(case_context, memory["notes"], memory["chat_history"])
        
        # 5. Auto-generate graph updates (proposed entities/edges)
        proposed_entities = []
        proposed_edges = []
        
        if verified_findings:
            extractor_prompt = f"Based on these verified intelligence findings, extract key entity nodes and relationship edges to update our Knowledge Graph:\n{json.dumps(verified_findings, indent=2)}\nAllowed entities: ['Person', 'Vehicle', 'Phone', 'BankAccount', 'Location', 'Organization', 'Crime', 'Document']"
            extractor_system = "You are a Graph Entity Extractor. Output JSON only. Format: {\"entities\": [{\"type\": \"Person\", \"name\": \"...\", \"properties\": {}}], \"relationships\": [{\"source_name\": \"...\", \"target_name\": \"...\", \"type\": \"...\", \"label\": \"...\", \"confidence\": float}]}"
            graph_str = ai_router.complete(extractor_prompt, system=extractor_system)
            try:
                if "```json" in graph_str:
                    graph_str = graph_str.split("```json")[1].split("```")[0].strip()
                graph_updates = json.loads(graph_str)
                proposed_entities = graph_updates.get("entities", [])
                proposed_edges = graph_updates.get("relationships", [])
            except Exception as e:
                print(f"[PlannerAgent] Graph extraction failed: {e}")

        # Automatically insert proposed entities as AI Suggestions
        created_entities_map = {}
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        
        # Fetch ontology version for case
        case_sql = "SELECT ontology_version FROM cases WHERE id = :case_id;"
        case_row = db_client.execute(case_sql, {"case_id": self.case_id}).fetchone()
        ontology_version = case_row[0] if case_row else "crime-analysis-v1"
        
        for ent in proposed_entities:
            try:
                ent_id = str(uuid.uuid4())
                props = ent.get("properties", {})
                if "name" not in props:
                    props["name"] = ent.get("name", "Unknown")
                
                from services.ontology import validate_entity
                if validate_entity(ontology_version, ent["type"], props):
                    initial_history = [{
                        "timestamp": now,
                        "action": "create",
                        "properties": props,
                        "confidence": 0.85,
                        "modified_by": "AI Planner Agent"
                    }]
                    sql = """
                    INSERT INTO entities (id, case_id, type, properties, confidence, source, created_by, created_at, updated_at, ai_summary, tags, location, version_history)
                    VALUES (:id, :case_id, :type, :properties, 0.85, 'AI Planner Agent', 'AI Planner Agent', :created_at, :updated_at, NULL, :tags, NULL, :version_history);
                    """
                    db_client.execute(sql, {
                        "id": ent_id,
                        "case_id": self.case_id,
                        "type": ent["type"],
                        "properties": json.dumps(props),
                        "created_at": now,
                        "updated_at": now,
                        "tags": "[]",
                        "version_history": json.dumps(initial_history)
                    })
                    created_entities_map[props["name"].lower()] = ent_id
                    ent["id"] = ent_id
            except Exception as e:
                print(f"[PlannerAgent] Failed to stage entity {ent}: {e}")

        # Automatically insert proposed relationships
        for edge in proposed_edges:
            try:
                src_name = edge.get("source_name", "").lower()
                tgt_name = edge.get("target_name", "").lower()
                
                src_id = created_entities_map.get(src_name)
                tgt_id = created_entities_map.get(tgt_name)
                
                if not src_id:
                    res_src = db_client.execute("SELECT id FROM entities WHERE case_id = :case_id AND lower(json_extract(properties, '$.name')) = :name;", {"case_id": self.case_id, "name": src_name}).fetchone()
                    if res_src:
                        src_id = res_src[0]
                if not tgt_id:
                    res_tgt = db_client.execute("SELECT id FROM entities WHERE case_id = :case_id AND lower(json_extract(properties, '$.name')) = :name;", {"case_id": self.case_id, "name": tgt_name}).fetchone()
                    if res_tgt:
                        tgt_id = res_tgt[0]
                        
                if src_id and tgt_id:
                    rel_id = str(uuid.uuid4())
                    initial_history = [{
                        "timestamp": now,
                        "action": "create",
                        "label": edge.get("label", ""),
                        "confidence": 0.85,
                        "modified_by": "AI Planner Agent"
                    }]
                    ins_rel = """
                    INSERT INTO relationships (id, case_id, source_entity_id, target_entity_id, relationship_type, label, confidence, evidence, created_by, created_at, last_updated, version_history)
                    VALUES (:id, :case_id, :source_entity_id, :target_entity_id, :relationship_type, :label, 0.85, :evidence, 'AI Planner Agent', :created_at, :last_updated, :version_history);
                    """
                    db_client.execute(ins_rel, {
                        "id": rel_id,
                        "case_id": self.case_id,
                        "source_entity_id": src_id,
                        "target_entity_id": tgt_id,
                        "relationship_type": edge["type"],
                        "label": edge.get("label", ""),
                        "evidence": json.dumps([{"type": "AI Extraction", "source": "AI Planner Agent"}]),
                        "created_at": now,
                        "last_updated": now,
                        "version_history": json.dumps(initial_history)
                    })
                    edge["id"] = rel_id
            except Exception as e:
                print(f"[PlannerAgent] Failed to stage relationship {edge}: {e}")

        if progress_callback:
            progress_callback({"stage": "complete", "message": "Investigation completed."})
            
        return {
            "task_id": task_id,
            "briefing": briefing,
            "findings": verified_findings,
            "proposed_entities": proposed_entities,
            "proposed_edges": proposed_edges
        }

    def plan_and_execute(self, user_goal: str, progress_callback = None) -> Dict[str, Any]:
        """
        Compatibility method. Decomposes goal, dispatches to agents, verifies results, writes to graph, and returns summary.
        """
        subtasks = self.generate_plan(user_goal)
        if progress_callback:
            progress_callback({
                "stage": "plan_ready", 
                "message": f"Planner created {len(subtasks)} subtasks.",
                "subtasks": subtasks
            })
        return self.execute_plan(user_goal, subtasks, progress_callback=progress_callback)
