

const NAV = [
  {
    group: 'Workspace v2',
    items: [
      { id: 'cases', code: 'CAS', label: 'Cases', icon: 'ti-briefcase' },
      { id: 'admin', code: 'ADM', label: 'Admin Panel', icon: 'ti-settings' }
    ]
  },
  {
    group: 'Analysis',
    items: [
      { id: 'heatmap',   code: 'MAP', label: 'Heatmap',   icon: 'ti-map-pin' },
      { id: 'trends',    code: 'TRD', label: 'Trends',    icon: 'ti-chart-line' },
      { id: 'districts', code: 'DST', label: 'Districts', icon: 'ti-building' },
      { id: 'network',   code: 'NET', label: 'Network',   icon: 'ti-vector-triangle' },
    ]
  },
  {
    group: 'Models',
    items: [
      { id: 'ai-forecast', code: 'FCT', label: 'Forecast',  icon: 'ti-trending-up' },
      { id: 'ai-hotspots', code: 'HOT', label: 'Hotspots',  icon: 'ti-crosshair' },
      { id: 'ai-network',  code: 'FIN', label: 'Financial', icon: 'ti-credit-card' },
      { id: 'ai-patterns', code: 'PAT', label: 'Patterns',  icon: 'ti-hexagons' },
      { id: 'ai-anomalies',code: 'ANO', label: 'Anomalies', icon: 'ti-activity' },
      { id: 'ai-assistant',code: 'AST', label: 'Assistant', icon: 'ti-terminal-2' },
    ]
  }
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sb">
      <div className="sb-brand">
        <img src="/logo.png" style={{ width: '22px', height: '22px', objectFit: 'contain' }} alt="Logo" />
        <div>
          <div className="sb-name">Sentinel</div>
          <div className="sb-sub">CRIME ANALYSIS</div>
        </div>
      </div>

      {NAV.map(group => (
        <div key={group.group} className="sb-group">
          <div className="sb-group-label">{group.group}</div>
          {group.items.map(item => (
            <div
              key={item.code}
              id={`nav-${item.id}`}
              onClick={() => onNavigate(item.id)}
              style={{ cursor: 'pointer' }}
              className={`sb-item${active === item.id ? ' active' : ''}`}
            >
              <i className={`ti ${item.icon} sb-icon`} />
              <span className="sb-label">{item.label}</span>
            </div>
          ))}
        </div>
      ))}

      <div className="sb-footer">
        <span className="sb-footer-txt">Karnataka · 2018–2024</span>
        <div className="sb-footer-dot" />
      </div>
    </aside>
  );
}
