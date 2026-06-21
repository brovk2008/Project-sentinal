# 09 — Investigation Workspace

**Depends on:** `00_Vision.md`, `02_UI_UX.md`, `03_Agent_System.md`, `04_Knowledge_Graph.md`

---

## 1. The Case Model

A Case is the top-level container referenced throughout every other doc. Schema:

```json
{
  "id": "uuid",
  "name": "Operation Black Hawk",
  "type": "crime-analysis | disaster-response | fraud-investigation | ...",
  "ontology_version": "crime-analysis-v1",
  "created_by": "user_id",
  "created_at": "timestamp",
  "status": "active | archived",
  "permissions": [{"user_id": "...", "role": "owner | editor | viewer"}],
  "ui_state": {
    "panel_layout": {},
    "open_tabs": [],
    "map_position": {},
    "timeline_position": {}
  }
}
```

- `ui_state` is what makes "refresh never loses anything" (non-negotiable #1) concrete — it's persisted on every meaningful UI change (debounced, not on every pixel of panel resize)
- `permissions` is Phase 0 single-org RBAC only (owner/editor/viewer) — cross-org sharing is Phase 2+ per `00_Vision.md` §6

## 2. Case Operations

| Operation | Behavior |
|---|---|
| Create | Choose ontology/type, name, initial description |
| Switch | Instant — loads `ui_state`, graph, and Case Memory (`03_Agent_System.md` §5) |
| Archive | Read-only, excluded from active Case list, not deleted |
| Duplicate | Deep-copies entities/relationships with new IDs; does **not** copy Case Memory chat history (avoids confusing provenance — duplicated Case starts with a clean reasoning log) |
| Delete | Soft-delete only in Phase 0–1 (audit trail requirement, `04_Knowledge_Graph.md` §5); hard-delete is an explicit Phase 2+ admin action with confirmation |

## 3. Connections Board (Flagship Feature)

The Connections Board is the primary canvas: drag entities onto a workspace, connect them, annotate connections, trigger research.

### 3.1 Interactions

| Action | Result |
|---|---|
| Drag a file/entity onto canvas | Creates or places an Entity node (`04_Knowledge_Graph.md` §3) |
| Draw a line between two nodes | Prompts for relationship type + free-text label; writes a `relationships` row with `created_by: user_id`, `confidence: 1.0` (user-asserted = full confidence by default, distinct from AI-suggested) |
| Click a node | Opens a side panel: metadata, AI summary, evidence list, history, linked entities |
| Click "Research" on a node | Triggers the Planner Agent flow (`01_System_Architecture.md` §3, `03_Agent_System.md` §3) |
| Right-click → "Mark as Hypothesis" | Converts a relationship into a Hypothesis (§5) instead of an asserted fact |

### 3.2 Visual Rendering

Per `02_UI_UX.md` §4, AI-suggested nodes/edges render with dashed borders, copper accent, and an "AI" badge until a user confirms them. Confirming an AI suggestion updates `created_by` to the user and `confidence` is preserved (not silently bumped to 1.0 — confirming provenance ownership is not the same as the user re-verifying the underlying claim).

### 3.3 Graph Physics & Performance

- Force-directed layout for graphs under ~500 visible nodes; beyond that, default to a filtered/clustered view (by entity type or by recency) rather than rendering everything at once — large unfiltered graphs are unreadable and slow regardless of engine
- Layout positions are saved per-Case (part of `ui_state`) so the graph doesn't re-shuffle on every load

## 4. Research Button — Detailed Flow

Already sequenced architecturally in `01_System_Architecture.md` §3. From a workspace-feature perspective, the contract is:

1. User selects one or more entities and clicks Research
2. Planner Agent proposes a subtask list **and shows it to the user before running** (e.g. "I'll check: legal records, financial transactions, satellite imagery for this location — proceed?") — this matters because free-tier API calls are a finite resource (`07_API_Integrations.md`) and the user should be able to deselect subtasks they don't want to spend quota on
3. Subtasks run, streaming progress per `02_UI_UX.md` §5
4. Results are **proposed**, not auto-committed: new entities/edges appear in the dashed/AI-suggested visual state (§3.2) for the user to confirm, reject, or edit
5. A research summary/briefing is generated and added to Case Memory

Step 2 and step 4 are deliberate design choices, not implementation details — the original brainstorm describes the Research button as fully automatic ("without you asking"). This doc inserts a confirm-before-run step for the *plan* (cheap, fast, protects API quota) while keeping result-gathering itself automatic, and inserts a confirm-before-commit step for *writes to the graph* (protects against the AI's findings being mistaken for verified fact, per non-negotiable #2). This is a safety-conscious adjustment to the original pitch, flagged here rather than silently changed.

## 5. Hypotheses

A first-class object type, distinct from confirmed entities/relationships:

```json
{
  "id": "uuid",
  "case_id": "uuid",
  "statement": "Suspect A financed Suspect B",
  "supporting_evidence": [
    {"relationship_id": "...", "supports": true},
    {"relationship_id": "...", "supports": false}
  ],
  "confidence": 0.74,
  "status": "open | confirmed | rejected",
  "created_by": "user_id",
  "history": [{"confidence": 0.5, "timestamp": "..."}, {"confidence": 0.74, "timestamp": "..."}]
}
```

- Confidence is recalculated whenever linked evidence changes (new supporting/contradicting relationship added, or evidence confidence itself changes)
- Recalculation formula (Phase 0): simple weighted average of supporting vs. contradicting evidence confidences — explicitly **not** a black-box ML score in Phase 0, because investigators need to be able to explain a hypothesis's confidence number in court/reporting contexts. A more sophisticated model is a Phase 2+ consideration, and even then must remain explainable (ties to `00_Vision.md` non-negotiable #2)
- Hypotheses render as diamond-shaped nodes on the Connections Board (`02_UI_UX.md` §4), never visually confusable with confirmed entities

## 6. Timeline

- Auto-populated from any entity/relationship/evidence with a timestamp
- Scrubbable — moving the timeline playhead filters the Connections Board and map to show only what was known/true as of that point in time
- Conflicts (e.g. two events that are logically inconsistent given travel time/location) are flagged by the Timeline Agent (`03_Agent_System.md` §2), not silently shown side by side

## 7. Phased Rollout

- **Phase 0:** Case CRUD, basic Connections Board (manual entity/relationship creation, no auto-research), Case Memory persistence
- **Phase 1:** Research button with Planner Agent integration, Hypotheses, Timeline
- **Phase 2:** Graph clustering for large Cases, cross-Case entity resolution, duplication/sharing refinements
