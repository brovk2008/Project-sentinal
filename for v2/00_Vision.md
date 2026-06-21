# 00 — Vision & Product Definition

**Document status:** Foundational. All other documents in `Sentinel_V2/` defer to this one for scope, terminology, and non-negotiables.

---

## 1. What Sentinel OS Is

Sentinel OS is an **AI-powered Intelligence Operating System** — not a chatbot, not a dashboard, not an analytics report viewer. It is the evolution of Project Sentinel (v1), a working platform that already integrates 15+ Karnataka state datasets (1.67M FIR records, 11M+ financial transactions, 33K CDRs) into a queryable RAG assistant with geospatial visualization and ML forecasting.

v1 proved the data pipeline and the RAG/ML core work. v2 restructures that core around a different organizing principle:

> **Everything belongs to a Case. Nothing disappears. Every claim is explainable.**

## 2. What Carries Forward from v1 (Binding)

These are not being rebuilt from scratch. v2 documents must integrate with, not replace, the following unless a doc explicitly states a migration reason:

| v1 Asset | v2 Role |
|---|---|
| FastAPI backend on Catalyst AppSail | Remains the core API gateway; v2 adds agent orchestration and graph endpoints alongside it |
| React + Vite frontend | Remains the frontend; v2 adds Connections Board, 3D Earth, Case Workspace as new top-level views |
| Catalyst Data Store | Remains primary structured store; v2 adds a graph layer modeled on top of it (see `04_Knowledge_Graph.md`) |
| Groq API (Llama 3.3 70B) | Becomes one provider in the AI Router (see `03_Agent_System.md`) |
| HF Inference Router (`all-MiniLM-L6-v2`) | Becomes the default embedding provider; v2 adds a real vector index to replace in-memory NumPy cosine similarity |
| 5 ML models (RandomForest, XGBoost, Isolation Forest, K-Means, Z-Score/IForest) | Wrapped as internal tools called by the Forecast Agent and Verification Agent |
| Existing datasets (FIR, transactions, CDRs, census, SHRUG, NCRB manuals) | Become seed entities/documents in the Knowledge Graph and Permanent Memory, not flat query tables |
| `/api/v1/*` routes | Stay live and unchanged. v2 adds `/api/v2/*` — no breaking changes to existing consumers in Phase 0–1 |

## 3. What's New in v2

| Module | One-line definition |
|---|---|
| Case | The unit everything belongs to. Replaces "session" or "chat" as the top-level container. |
| Connections Board | Drag-and-connect investigation canvas (Obsidian Graph / Palantir Gotham style) |
| Knowledge Graph | Typed entities + typed relationships + confidence scores, persisted, queryable |
| Multi-Agent System | Planner dispatches to specialized agents instead of one chatbot answering everything |
| AI Router | Picks the right model/provider per task instead of hardcoding one model everywhere |
| Permanent Memory | Every uploaded file is OCR'd, chunked, embedded, and indexed forever — versioned, never silently discarded |
| 3D Earth / GIS | Toggleable layers (crime, fire, population, weather, satellite) on a single map/globe view |
| Research Button | One-click: AI plans subtasks, searches all connected sources, scores evidence, updates the graph |
| Hypotheses | Theories with evidence-backed, auto-updating confidence scores — explicitly *not* presented as fact |
| Explainability | Every score/prediction ships with a "why," not just a number |

## 4. Target Users

- State/municipal crime analysts (the original v1 audience — Karnataka Police use case)
- Disaster response coordinators
- Cyber/fraud investigation teams
- Journalists doing OSINT-heavy investigative work
- Corporate/insurance investigation teams
- Research orgs needing case-structured, evidence-graded intelligence work

The core engine (Case → Entities → Evidence → Graph → Agents) does not change across these. Only the **ontology** (what entity/relationship types exist) and **plugins** (which data providers are wired in) change per vertical. This is a hard architectural requirement, not aspirational marketing — see `04_Knowledge_Graph.md` §2 for how ontologies are versioned per Case type.

## 5. Non-Negotiables (apply across every doc)

1. **No data loss on refresh.** Every Case auto-persists: graph layout, open tabs, map position, timeline scrub position, chat history, agent reasoning logs.
2. **No silent hallucination presented as fact.** Every AI-asserted relationship or score carries a confidence value, a source, and a "why." Unverified AI suggestions are visually and structurally distinct from user-confirmed/evidenced facts (see `09_Investigation_Workspace.md` §4).
3. **No hardcoded secrets, anywhere, in any doc, ever.** All credentials are referenced as environment variable names only (e.g. `NASA_API_KEY`) — see `07_API_Integrations.md` §1 for the full secrets-handling policy.
4. **Plugin-first.** New data providers, new entity types, and new agents must be addable without modifying core orchestration code. See `08_Catalyst_Architecture.md` and `03_Agent_System.md`.
5. **v1 is not broken.** `/api/v1/*` stays live throughout Phase 0–2. Deprecation, if it happens, is a Phase 3+ decision made explicitly, not a side effect of a v2 refactor.
6. **Free-tier-aware.** Groq and HF Inference Router (and most NASA/government APIs) are free-tier in v1. The AI Router and provider plugins must implement real fallback/backoff behavior, not assume unlimited quota — see `07_API_Integrations.md` §3.

## 6. Explicit Non-Goals (Phase 0–1)

To prevent scope collapse — these are real features described in the original brainstorm but deliberately deferred:

- Face recognition (Phase 2+, requires a dedicated vision pipeline and a much more careful legal/ethical review given the law-enforcement context — see `11_Future_Roadmap.md`)
- Full 3D photorealistic Earth rendering (Phase 1 ships 2D Leaflet + layer toggles, matching v1; 3D globe is Phase 2)
- Multi-tenant sharing/permissions across organizations (Phase 2+; Phase 0–1 is single-org RBAC only)
- Mobile app (web-responsive only through Phase 2)

## 7. Document Map

```
Sentinel_V2/
├── 00_Vision.md                    ← you are here
├── 01_System_Architecture.md       ← how the pieces fit together
├── 02_UI_UX.md                     ← screens, layout, design system
├── 03_Agent_System.md              ← Planner + specialized agents + AI Router
├── 04_Knowledge_Graph.md           ← entity/relationship model, graph-on-Catalyst
├── 05_RAG_System.md                ← permanent memory, embeddings, citations
├── 06_Data_Ingestion.md            ← file upload → OCR → chunk → index pipeline
├── 07_API_Integrations.md          ← every external provider, rate limits, fallback
├── 08_Catalyst_Architecture.md     ← which Catalyst services map to which module
├── 09_Investigation_Workspace.md   ← Case model, Connections Board, Research button
├── 10_Deployment.md                ← CI/CD, environments, secrets, monitoring
├── 11_Future_Roadmap.md            ← phased plan, what's deferred and why
```

## 8. How to Read These Docs

Each doc is independently implementable by a developer or an AI coding assistant working section-by-section, but each opens with a **"Depends on"** line pointing to the docs it assumes context from. When in doubt about scope or a conflicting detail, this document wins.
