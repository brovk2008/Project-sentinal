# 08 — Catalyst Architecture Mapping

**Depends on:** `01_System_Architecture.md`, `07_API_Integrations.md`

---

## 1. Principle

Per `00_Vision.md` non-negotiable #4 and the original product direction ("leverage as many managed Catalyst capabilities as practical... avoid reinventing capabilities Catalyst already provides"), this doc maps each Sentinel module to a specific Catalyst service rather than introducing new infrastructure by default.

**Important caveat:** the original brainstorm listed a long set of Catalyst service names (Signals, Circuits, Stratus, QuickML, SmartBrowz, etc.). This doc maps Sentinel's *functional needs* to Catalyst's *general service categories* (compute, data store, object store, cache, jobs, auth) rather than asserting specific product names/tiers that should be verified against Catalyst's current documentation at implementation time — service names and capabilities change, and getting this wrong in a spec is worse than leaving it as a category to confirm. Whoever picks this up should check current Catalyst docs before locking in specific service names.

## 2. Module → Catalyst Capability Mapping

| Sentinel Need | Catalyst Capability Category | v1 precedent |
|---|---|---|
| API gateway / compute | AppSail (container hosting) | Already used — backend + sentinel-test |
| Structured data (entities, relationships, Cases) | Data Store (NoSQL/ZCQL tables) | Already used for analytical tables |
| File storage (uploads, images, docs) | Object Store | New in v2 — confirm exact service name at implementation |
| Per-Case vector cache / rate-limit caching | Cache | New in v2 |
| Background jobs (file indexing, v1 dataset migration) | Job scheduling / cron capability | New in v2 |
| User auth, RBAC | Authentication service | New in v2 — v1 has no auth currently documented; this is a real gap to close before any multi-user Case sharing |
| WebSocket streaming | Confirm AppSail's WebSocket support, or a dedicated real-time/Signals-class service if AppSail doesn't support persistent connections well | New in v2 — verify before committing to the streaming architecture in `01_System_Architecture.md` §7 |
| Notifications (job complete, provider unhealthy) | Notification/push service category | New in v2 |
| API gateway-level rate limiting (protecting Sentinel's own endpoints, separate from external provider rate limits) | API Gateway capability if available | New in v2 |

## 3. Things to Verify Before Phase 0 Build Starts

Flagging explicitly rather than assuming, since service availability/naming may have changed since either v1 was built or this doc was written:

1. Does AppSail support long-lived WebSocket connections, or does streaming need a different pattern (e.g. Server-Sent Events, or polling a job-status endpoint)? This materially affects `01_System_Architecture.md` §7 and `02_UI_UX.md` §5.
2. What's Catalyst's current Object Store offering called, and what are its size/throughput limits relevant to large case files (video, large PDFs)?
3. Does Catalyst offer a managed auth/RBAC service, or does Sentinel need to build its own auth layer on top of Data Store? This is a Phase 0 blocker for any multi-user feature.
4. Confirm Data Store's actual write-throughput characteristics before finalizing the v1 dataset batch migration design (`06_Data_Ingestion.md` §4) — 1.67M+ row migrations need realistic batching numbers, not assumed ones.

## 4. Phased Rollout

- **Phase 0:** Confirm the four open questions in §3 against current Catalyst documentation. This is a prerequisite task, not parallel work — several Phase 0 architecture decisions depend on the answers.
- **Phase 1:** Wire Object Store, Cache, and Job scheduling for the ingestion pipeline.
- **Phase 2:** Auth/RBAC, notifications, any Phase 2 service needs identified along the way.
