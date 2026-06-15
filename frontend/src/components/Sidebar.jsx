export default function Sidebar({ active, onNavigate }) {
  const intelligence = [
    { id: 'heatmap',   code: 'MAP', label: 'Crime Heatmap' },
    { id: 'trends',    code: 'TRD', label: 'Crime Trends' },
    { id: 'districts', code: 'DST', label: 'District Intel' },
    { id: 'network',   code: 'NET', label: 'Network Analysis' },
  ]

  const ai = [
    { id: 'ai-forecast', code: 'FCT', label: 'Risk Forecast' },
    { id: 'ai-hotspots', code: 'HOT', label: 'Hotspot Predict' },
    { id: 'ai-network',  code: 'FIN', label: 'Financial Risk' },
    { id: 'ai-patterns', code: 'PAT', label: 'Crime Patterns' },
    { id: 'ai-anomalies',code: 'ANO', label: 'Anomaly Feed' },
    { id: 'ai-assistant',code: 'AST', label: 'Intel Assistant' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-box">S</div>
          <h1>Sentinel</h1>
        </div>
        <p>Karnataka Crime Intelligence</p>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-label">Intelligence</div>
        {intelligence.map(item => (
          <div
            key={item.id}
            id={`nav-${item.id}`}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.code}</span>
            <span>{item.label}</span>
          </div>
        ))}

        <div className="nav-divider" />
        <div className="nav-label">AI Layer</div>
        {ai.map(item => (
          <div
            key={item.id}
            id={`nav-${item.id}`}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.code}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="live-dot" />
        KA · 1.67M FIRs
      </div>
    </aside>
  )
}
