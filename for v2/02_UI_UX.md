# 02 — UI / UX Specification

**Depends on:** `00_Vision.md`, `01_System_Architecture.md`

---

## 1. Design System (extends v1, does not replace it)

v1 already ships a "Premium Greyscale & Copper UI" with dark/light theme swapping (confirmed in the README screenshots: dark theme default, warm parchment light theme, copper accent `#c8814a` visible in the badge colors). v2 extends this rather than introducing a new visual language.

| Token | v1 Value (carried forward) | v2 Addition |
|---|---|---|
| Accent | Copper `#c8814a` | Used for AI-generated/unverified content markers (see §4) |
| Theme | Dark default, light "warm parchment" alt | Add a true "Ops Black" high-contrast theme for the Connections Board (reduces visual noise on dense graphs) |
| Typography | Not specified in v1 README — confirm existing font stack before v2 build starts | Maintain existing stack; do not introduce a second typeface family |
| Map | Leaflet | Carried forward for 2D (`09_Investigation_Workspace.md` §3); 3D Earth is additive, Phase 2 |

**Action item for implementer:** before writing any v2 frontend code, inventory v1's actual `tailwind.config` / CSS variables / component library so new components match exactly. Do not guess at hex values beyond what's confirmed above.

## 2. Core Layout: Case Workspace

```
┌─────────────────────────────────────────────────────────────────┐
│  Top Bar: Case Switcher │ Command Palette (⌘K) │ User │ Notifs  │
├───────────┬─────────────────────────────────┬───────────────────┤
│           │                                 │                   │
│  LEFT     │           CENTER                │      RIGHT        │
│  Knowledge│       Connections Board /        │    AI Copilot     │
│  Graph    │       Map / Document Viewer      │      Chat         │
│  (mini)   │       (tabbed)                   │                   │
│           │                                 │                   │
├───────────┴─────────────────────────────────┴───────────────────┤
│  BOTTOM: Timeline (scrubbable, collapsible)                      │
└─────────────────────────────────────────────────────────────────┘
```

- All four panels are **dockable and resizable** (per `00_Vision.md` §4 design principles)
- Panel layout persists per-Case (non-negotiable #1 — refresh must not lose state)
- Center panel is tabbed: Connections Board | 2D Map | 3D Earth (Phase 2) | Document Viewer | Report Preview

## 3. Primary Screens

| Screen | Purpose | New in v2? |
|---|---|---|
| Case List / Switcher | Browse, create, archive, duplicate Cases | New |
| Case Workspace | Main 4-panel layout above | New |
| Connections Board | Drag-connect investigation canvas | New (flagship — see `09_Investigation_Workspace.md`) |
| GIS / Map View | Layered map (carries forward v1's Leaflet heatmap) | Extends v1 |
| Intelligence Chat (legacy) | v1's existing RAG terminal | Kept as a "Quick Query" mode, separate from Case-scoped AI Copilot |
| Reports | Generate/export briefings | New |
| Admin | RBAC, audit log, provider health | New |

## 4. Explainability & Trust Visual Language

Per `00_Vision.md` non-negotiable #2, AI-suggested content must be visually distinct from confirmed/evidenced facts:

| State | Visual treatment |
|---|---|
| User-confirmed entity/edge | Solid border, full opacity |
| AI-suggested, unconfirmed | Dashed border, copper accent, lower opacity, small "AI" badge |
| Confidence score | Always visible on hover/click — never hidden behind an extra click for high-stakes fields |
| Hypothesis (vs. fact) | Distinct node shape (diamond, not circle/rectangle) — never visually confusable with a confirmed entity |

This is a hard UI requirement, not a style suggestion — confusing an AI guess for a confirmed fact in an investigation tool is the single worst failure mode of this product category.

## 5. Loading & Streaming States

Per `00_Vision.md` §4 ("no blank screens," "every long-running task should show progress"):

- Skeleton loaders for all panel content, matching the eventual layout (not generic spinners)
- AI chat responses stream token-by-token
- Research button progress shows the live subtask list (per `01_System_Architecture.md` §3 sequence diagram) — not just a spinner
- Long-running background jobs (file indexing, large research tasks) get a persistent toast/notification, not a blocking modal

## 6. Command Palette

`⌘K` / `Ctrl+K` opens a command palette supporting:
- Jump to Case
- Create entity
- Run Research on selected entity
- Generate report
- Switch theme
- Search across current Case (RAG-powered)

## 7. Accessibility & Responsiveness

- Phase 0–1: desktop-first, responsive down to tablet width. Mobile is explicitly out of scope (`00_Vision.md` §6)
- Keyboard navigation required for all primary actions (investigation tools are frequently used in low-bandwidth, keyboard-heavy operational environments)
- Color is never the sole signal for confidence/state (pair with icon/shape per §4 — colorblind-safe)
