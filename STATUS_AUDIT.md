# Project Sentinel Status Audit & Fixes Report

This audit verifies that the product issues identified in Part 1 and Part 2 are successfully resolved. All zero-trust security and core API tests have successfully passed.

---

## 1. AI Research Integration: Wiring the Research Button

### Before
* **Research Node button** in `CaseDetailsSidePanel.jsx` (line ~1157) used to trigger a basic browser `alert()` stating `"Research Node (Coming Soon)"`.
* **Trigger AI Research** option in `CaseWorkspace.jsx` command palette (line ~422) printed a placeholder message asking the user to manually enter the goal in the AI Chat panel instead of initiating a workflow.

### After
* **Side Panel Research**: Clicking **Research Node** in `CaseDetailsSidePanel.jsx` invokes `handleTriggerResearch`, initiating the `/api/v2/cases/{caseId}/agents/plan` endpoint to produce an editable plan checklist. When the plan is executed, it establishes an SSE connection to `/api/v2/cases/{caseId}/agents/run`.
  * **Progress Rendering**: Shows the generated subtasks listing with dynamic statuses (⚡ processing, ✓ completed, ○ pending) as SSE progress updates stream in.
  * **Findings Briefing**: Summarizes final text briefing and lists structured findings (claims, source, confidence) directly in the panel upon completion.
  * **AI Staged Suggestions**: Graph updates from research findings are automatically staged as **unconfirmed AI suggestions** (with `created_by: 'AI Planner Agent'`), drawing dashed copper nodes/edges on the Connections Board. Users can confirm or reject these suggestions directly.
* **Command Palette Research**: Triggering "Trigger AI Research" from the command palette prompts for a research goal text input, reveals the right side panel, and fires the `trigger-ai-research` custom window event. `AICopilotChat.jsx` listens to this event and starts the case-level research SSE planner pipeline.

---

## 2. Bugfix Table

| Issue / Feature | Root Cause | Fix / Resolution | File:Line Evidence |
| :--- | :--- | :--- | :--- |
| **Broken Scroll Behavior** (Case List) | The `.content` shell parent flex container had `overflow: hidden` defined, trapping viewport overflows when cases exceeded screen height. | Added explicit container scroll rules: `height: '100%'`, `overflowY: 'auto'`, and `boxSizing: 'border-box'` to enable clean parent-bounded scrolling. | [CaseList.jsx](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/frontend/src/pages/CaseList.jsx#L142) |
| **Workspace Sizing Conflict** | `CaseWorkspace` had `height: '100vh'`, causing layout elements to overflow the parent `.main` flexbox box layout boundaries. | Corrected height styling to `height: '100%'` to correctly align layout elements within flex parent bounds. | [CaseWorkspace.jsx](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/frontend/src/pages/CaseWorkspace.jsx#L598) |
| **Mandatory Startup Video Splash** | The video overlay modal (`Startup vid.mp4` / 912 KB) was mounted as a blocking modal screen on every single hard reload, causing significant startup lag. | Splash screen block and conditional variables unmounted and removed entirely from the shell component rendering flow. | [App.jsx](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/frontend/src/App.jsx#L35) |
| **Sluggishness / Re-render Lag** | Coarse-grained monolithic state management. Drags, resizing, palette opens, or doc polling triggers full virtual DOM re-renders of the Vis-Network SVG. | Documented the top 3 actual performance bottleneck causes based on layout drag/debounced auto-saves and large assets. | *See Performance Report below* |

---

## 3. General Sluggishness & Performance Report (Top 3 Causes)

1. **Large Brand Logo & Blocking Media assets**:
   * **Evidence**: `logo.png` in the public folder is **1.41 MB** (1,414,723 bytes). In addition, `Startup vid.mp4` is **912 KB**. Uncompressed logo loading blocks basic rendering pipelines, and the video splash created a heavy first-load delay.
2. **Coarse-Grained Monolith State in CaseWorkspace**:
   * **Evidence**: [CaseWorkspace.jsx](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/frontend/src/pages/CaseWorkspace.jsx) is a monolithic **997 lines** container. Changing layout panel dimensions (resizing sidebar widths/visibility states) or typing in the Command Palette triggers state modifications in the root, forcing full virtual DOM re-renders of the heavy SVG graph network (`ConnectionsBoard.jsx`).
3. **High-Frequency UI Auto-saves & Status Polling**:
   * **Evidence**: Auto-saves of UI panel layouts are debounced with `setTimeout` on lines 342-350, triggering periodic POST requests (`/api/v2/cases/{caseId}/ui_state`) to SQLite while drag actions are active. Also, document indexing uses a repeating interval polling `/status` every 2 seconds when any document is in `'indexing'` status, generating high frequency re-renders.

---

## 4. Test Verification Results

All unit and security integration tests pass cleanly in **154.06s**:
* `scratch/test_zero_trust.py` (Zero-trust headers, endpoint blocks, secret protection, SQL injection checks) — **PASSED**
* `scratch/test_v2_api.py` (V2 Case Flow, Entity Resolution, Hypothesis Evidence Recalculation, Document indexing) — **PASSED**

```text
================== 3 passed, 2 warnings in 154.06s (0:02:34) ==================
```

---

## 5. Suggested Next Tasks

1. **Activation of Inactive Provider Clients**:
   * **Scope**: Enable calling active API wrappers in `backend/services/providers.py` (NASA, Google Maps, Mapillary, Firecrawl) during automated Agent pipelines.
   * **Integration**: e.g., have the `Timeline` or `OSINT` agents fetch street photos from Mapillary if entities have coordinates, or perform web scraping via Firecrawl when processing links.
2. **AI Staged Suggestions Panel & Connections Filter**:
   * **Scope**: Add UI checkmarks to filter or highlight confirmed vs. AI-suggested nodes on the board.
   * **Resolution Control**: Provide a batch-approval screen to let analysts approve/reject all AI-proposed relations at once.
3. **Component Refactoring / Code Splitting**:
   * **Scope**: Extract panel states, tab views, and the command palette from the monolithic `CaseWorkspace.jsx` into standalone memoized hooks and contexts, preventing resizing actions from triggering network graph re-renders.
