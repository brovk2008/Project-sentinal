# 04 — Knowledge Graph

**Depends on:** `00_Vision.md`, `01_System_Architecture.md` §5 (graph-on-Catalyst decision)

---

## 1. Why a Graph, Not Tables

v1's data model is flat analytical tables (FIR records, transactions, CDRs) queried independently per-endpoint. v2's Connections Board requires traversable relationships: "show me everything connected to this phone number within 2 hops." That's a graph query pattern, not a table-scan pattern, regardless of which physical storage backs it — see `01_System_Architecture.md` §5 for the decision to model this on Catalyst Data Store rather than a dedicated graph DB.

## 2. Entity Types & Ontology Versioning

The schema below is the **default/seed ontology** for the law-enforcement/crime-analysis vertical (matching v1's actual domain — Karnataka Police use case). Per `00_Vision.md` §4, the core engine must support other verticals (disaster response, fraud investigation, etc.) by swapping the ontology, not the engine.

**Mechanism:** each Case references an `ontology_version` (e.g. `crime-analysis-v1`). Ontologies are JSON schema documents stored in Catalyst Data Store, defining allowed entity types, their properties, and allowed relationship types between them. The graph engine validates writes against the active ontology but does not hardcode entity types in application code.

### 2.1 Seed Ontology — `crime-analysis-v1`

| Entity Type | Key Properties |
|---|---|
| Person | name, DOB, ID numbers, known aliases |
| Vehicle | registration, make/model, owner_entity_id |
| Phone | number, IMEI, carrier |
| BankAccount | account number (masked), institution |
| Organization | name, registration details |
| Evidence | type, collected_date, chain_of_custody |
| Crime | FIR number, IPC/BNS sections, date, station |
| Case | (meta — see `09_Investigation_Workspace.md`) |
| Location | coordinates, address, type (residence/business/incident) |
| Document | file reference, source |
| Image / Video / Audio | file reference, metadata (EXIF etc.) |
| SocialAccount | platform, handle |
| Website / Domain / IPAddress | for OSINT/cyber findings |
| PoliceStation / Hospital / GovernmentOffice | infrastructure entities, used for geospatial proximity queries |

### 2.2 Relationship Types (examples, not exhaustive)

`registered_owner_of`, `family_member_of`, `witnessed`, `financial_transfer_to`, `seen_with`, `located_at`, `mentioned_in`, `same_device_as`, `suspected_alias_of`

Each relationship instance stores:

```json
{
  "id": "uuid",
  "case_id": "uuid",
  "source_entity_id": "uuid",
  "target_entity_id": "uuid",
  "relationship_type": "financial_transfer_to",
  "label": "user-entered free text, e.g. 'Registered Owner'",
  "confidence": 0.93,
  "evidence": [
    {"type": "document", "ref": "doc_id", "excerpt_ref": "page 4"},
    {"type": "agent_finding", "agent": "FinancialIntelligenceAgent", "claim": "..."}
  ],
  "created_by": "user_id | agent_name",
  "created_at": "timestamp",
  "last_updated": "timestamp"
}
```

This structure directly satisfies the "evidence-driven linking" requirement from the original brainstorm — a relationship's confidence is never a bare number, it's always backed by an `evidence[]` array that the UI can render as the "why" (`02_UI_UX.md` §4).

## 3. Entity Metadata (all types)

Every entity, regardless of type, carries:

```
id, case_id, type, properties (JSON, validated against ontology),
confidence, source, created_by, created_at, updated_at,
ai_summary (nullable — generated, regenerable, never hand-authored),
tags[], location (nullable, for map placement),
version_history[] (see §5)
```

## 4. Graph Read Patterns (what the Connections Board actually queries)

| Query | Implementation |
|---|---|
| Load full Case graph | Single paginated read from `entities` + `relationships` filtered by `case_id` |
| N-hop neighborhood of a node | Served from the materialized adjacency cache (`01_System_Architecture.md` §5), falls back to a recursive ZCQL query on cache miss |
| Path between two entities | Bounded BFS over the adjacency cache (depth-limited, e.g. max 6 hops, to avoid runaway queries on large Cases) |
| Entities by type within a Case | Indexed table read, filtered by `type` |

## 5. Versioning

Every entity/relationship edit is appended to a `version_history` log rather than overwritten in place — this is required, not optional, because:
- Investigations need an audit trail (who changed what, when)
- Confidence scores change as new evidence arrives (per the Hypotheses feature in `09_Investigation_Workspace.md` §5) and the *history* of that change is itself investigatively relevant
- Undo/redo in the Connections Board UI depends on this

## 6. Seeding from v1 Datasets

v1's existing tables become initial entity sources, not replaced:

| v1 Dataset | Becomes |
|---|---|
| FIR Details (1.67M rows) | `Crime` entities, linked to `Location` and `PoliceStation` entities |
| Financial Transactions | `BankAccount` entities + `financial_transfer_to` relationships |
| CDRs | `Phone` entities + `same_device_as`/`called` relationships |
| Census/SHRUG | Attached as `properties` on `Location` entities (district-level), not separate entity types |

This is a **batch migration job**, not a live join — converting 1.67M FIR rows into individually addressable graph entities at query time would be prohibitively slow. The migration runs once (per `06_Data_Ingestion.md` §4) and populates the graph tables; v1's original flat tables remain queryable as-is for the existing `/api/v1/*` endpoints (heatmap, trends) which don't need graph semantics.

## 7. Phased Rollout

- **Phase 0:** Schema + ontology engine + manual entity/relationship creation in the Connections Board UI
- **Phase 1:** Batch migration of v1 datasets into graph entities; adjacency cache; Research-button-driven automated writes
- **Phase 2:** Multi-ontology support for non-crime verticals; cross-Case entity resolution (same person appearing in two different Cases)
