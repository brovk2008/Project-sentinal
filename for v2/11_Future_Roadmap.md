# 11 — Future Roadmap

**Depends on:** all preceding docs — this is the consolidated phase plan.

---

## 1. Phase Plan (consolidated)

This pulls every "Phased Rollout" section from docs 01–10 into one sequence. Phases are scoped by dependency, not by calendar time — a phase starts when its prerequisites from earlier phases are done, not on a fixed date.

### Phase 0 — Foundation (no user-visible Connections Board yet)
- Confirm Catalyst service questions (`08_Catalyst_Architecture.md` §3) — **prerequisite for everything else**
- Formalize `staging`/`production` environments (`10_Deployment.md` §1)
- Case model CRUD + `ui_state` persistence (`09_Investigation_Workspace.md` §1–2)
- Knowledge Graph schema + ontology engine, manual entity/relationship creation only (`04_Knowledge_Graph.md` §7)
- Case-scoped RAG over existing formats, v1 parity (`05_RAG_System.md` §6)
- Provider Interface scaffolding against Groq + HF only (`07_API_Integrations.md` §6)
- Planner + RAG Agent + Router, Groq/HF only (`03_Agent_System.md` §7)
- Basic Connections Board UI: manual drag/connect, no auto-research (`09_Investigation_Workspace.md` §7)

### Phase 1 — Intelligence Layer Comes Online
- NASA, Mapillary, Google Maps, Indian Kanoon, Firecrawl, Tavily integrated (`07_API_Integrations.md` §6)
- Remaining agents: OSINT, Geospatial, Legal, Verification, Timeline, Memory, Citation (`03_Agent_System.md` §7)
- Research button fully wired (`09_Investigation_Workspace.md` §4)
- Hypotheses + Timeline (`09_Investigation_Workspace.md` §7)
- v1 dataset batch migration built and run against staging (`06_Data_Ingestion.md` §5, `04_Knowledge_Graph.md` §7)
- GeoJSON/KML/Shapefile + image OCR ingestion (`06_Data_Ingestion.md` §5) — **blocked on vision provider decision**, see §2 below
- Object Store, Cache, Job scheduling wired (`08_Catalyst_Architecture.md` §4)
- Full CI/CD with staging gate (`10_Deployment.md` §6)

### Phase 2 — Scale & Polish
- Financial Intelligence + Forecast agents wired to existing ML models (`03_Agent_System.md` §7)
- Multi-provider verification (`03_Agent_System.md` §7)
- Audio/video transcription (`06_Data_Ingestion.md` §5)
- Multi-ontology support for non-crime verticals (`04_Knowledge_Graph.md` §7)
- Cross-Case entity resolution (`04_Knowledge_Graph.md` §7)
- Auth/RBAC, multi-org sharing (`00_Vision.md` §6, `08_Catalyst_Architecture.md` §4)
- 3D Earth globe view (`00_Vision.md` §6, `09_Investigation_Workspace.md`)
- Cost/quota alerting, rollback automation (`10_Deployment.md` §6)
- Re-evaluate dedicated vector DB if any Case exceeds ~20K chunks (`01_System_Architecture.md` §4)
- Re-evaluate dedicated graph DB if any Case exceeds ~50K nodes (`01_System_Architecture.md` §5)

### Explicitly Out of Scope Through Phase 2
- Face recognition — deferred pending dedicated vision pipeline and legal/ethical review (`00_Vision.md` §6)
- Mobile app (`00_Vision.md` §6)
- Full multi-tenant cross-org permissions (`00_Vision.md` §6)

## 2. Open Decisions Requiring a Human Call (not Claude's to resolve unilaterally)

These are flagged throughout the docs and collected here so they aren't lost:

1. **Vision/OCR provider** — which provider, what cost tier (`07_API_Integrations.md` §4.1.1)
2. **Second LLM completion provider** — which one, for Router diversity and Verification Agent (`07_API_Integrations.md` §4.1.4)
3. **Population data source licensing** — Worldometers has no official public API; needs a licensed alternative or a scraping-policy decision (`07_API_Integrations.md` §4)
4. **CERT-IN/PIB/RBI integration approach** — scraped via Firecrawl/Tavily vs. a dedicated plugin, pending confirmation these don't expose conventional APIs (`07_API_Integrations.md` §4.1.2)
5. **Vector index scaling path** — stay on per-Case NumPy cache vs. move to a dedicated vector DB, decision point at ~20K chunks/Case (`01_System_Architecture.md` §4)
6. **Graph storage scaling path** — stay on Catalyst Data Store adjacency cache vs. move to a dedicated graph DB, decision point at ~50K nodes/Case (`01_System_Architecture.md` §5)
7. **WebSocket support on AppSail** — confirm before committing to the streaming architecture as designed (`08_Catalyst_Architecture.md` §3)

## 3. Long-Term Vision Beyond Phase 2

Per the original brainstorm's correct framing: the core engine (Case → Entities → Evidence → Graph → Agents) is domain-agnostic. Once Phase 2 proves the architecture in the crime-analysis vertical (the actual v1 domain), the same engine could support other ontologies — disaster response, fraud investigation, supply-chain intelligence — by defining new ontology JSON schemas and provider plugins, without touching the core. This is a Phase 3+ conversation and intentionally not scoped further here; speculating on a 12th-doc level of detail for verticals that don't have a concrete user yet would be planning fiction rather than a usable spec.
