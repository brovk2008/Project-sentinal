# 08 — Frontend Architecture

This document describes the React frontend architecture for Project Sentinel. The application is built using **Vite + React** and follows a premium, high-contrast monochrome design system.

## Component Hierarchy

The application component tree is structured as follows:

```
main.jsx
└── App.jsx (App Container & Simple Route Router)
    ├── Sidebar (Navigation & App Status Indicators)
    └── Pages
        ├── CrimeHeatmap (1km² Density Grid & Station Map)
        ├── CrimeTrends (Temporal charts, DOW, YoY)
        ├── DistrictDrilldown (Interactive Taluk Profiles)
        ├── NetworkAnalysis (Financial & CDR links visualization)
        ├── AIForecasting (XGBoost prediction & Residual analysis)
        ├── AIHotspots (Random Forest station probability charts)
        ├── AINetworkRisk (Mule account scanning list & ego graphs)
        ├── AICrimePatterns (K-Means Station & Crime category clustering)
        ├── AIAnomalies (Multi-type anomaly ticker with severity filters)
        └── IntelligenceAssistant (Premium CLI RAG terminal)
```

---

## Design System & Theme

The user interface follows a strict **Dark Monochrome Design Philosophy**:
- **Background**: `#0A0A0A` (Midnight Black)
- **Secondary Cards**: `#121212` (Off-black) with subtle `#1F1F1F` borders.
- **Typography**: Curated sans-serif fonts with strict hierarchy.
- **Color Accents**: Extremely limited color palette (pure white, standard gray, and dark red `#E53E3E` for warning/high-risk levels). Blue, cyan, purple, and neon gradients are excluded to maintain a high-trust intelligence dashboard aesthetic.

## Navigation & Routing

The layout uses a persistent left sidebar ([Sidebar.jsx](file:///c:/Users/techp/Downloads/more%20projects/Project%20Sentinel/frontend/src/components/Sidebar.jsx)) for switching between pages:

```javascript
// App.jsx simple router configuration
const [currentPage, setCurrentPage] = useState('assistant'); // default RAG view
```

### Dashboard Pages

1. **Crime Heatmap**: Renders map polygons and buckets for the 36 districts of Karnataka using coordinate arrays and spatial density filters.
2. **Network Analysis**: Implements SVG network node-link rendering for CDR contacts and transaction paths.
3. **AI Forecasting / Hotspots**: Showcases prediction intervals and global feature importance metrics extracted directly from the XGBoost models.
4. **Intelligence Assistant**: Interactive chat interface with source expansion drawers. Highlights evidence blocks and confidence ratings.

## Related Notes
- [[02_System_Architecture]]
- [[07_API_Documentation]]
- [[09_RAG_System]]
- [[11_Demo_Walkthrough]]
