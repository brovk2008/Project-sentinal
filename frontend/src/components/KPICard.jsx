export default function KPICard({ value, label, sub, change }) {
  const isUp   = change !== undefined && change !== null && change > 0
  const isDown = change !== undefined && change !== null && change < 0

  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {change !== undefined && change !== null && (
        <div className={`kpi-change ${isUp ? 'up' : isDown ? 'down' : ''}`}>
          {isUp ? '+' : ''}{Math.abs(change).toFixed(1)}%
        </div>
      )}
    </div>
  )
}
