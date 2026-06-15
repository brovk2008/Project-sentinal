import { useState, useEffect } from 'react'
import { getApiBaseUrl } from '../config'

const API = `${getApiBaseUrl()}/api/v1/ai`

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return '₹' + (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return '₹' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return '₹' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function getTitle(anom) {
  if (anom.type === 'crime_spike') {
    return `Crime Spike in ${anom.district}`
  } else if (anom.type === 'financial_anomaly') {
    return `Suspicious Transfer: ${anom.sender.slice(0, 8)}...`
  } else if (anom.type === 'district_outlier') {
    return `Outlier District: ${anom.district}`
  }
  return 'Unknown Anomaly'
}

function getSubtitle(anom) {
  if (anom.type === 'crime_spike') {
    return `Month: ${anom.month} · Z-Score: ${anom.z_score}`
  } else if (anom.type === 'financial_anomaly') {
    return `Amount: ${fmt(anom.amount)} · Vel Score: ${anom.velocity_score}`
  } else if (anom.type === 'district_outlier') {
    return `Demographic Outlier · Score: ${anom.anomaly_score}`
  }
  return ''
}

function XAIPanel({ item }) {
  if (!item) return (
    <div className="ai-sidebar">
      <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 11 }}>
        Select an anomaly alert to view AI threat analysis
      </div>
    </div>
  )

  const maxImp = Math.max(...(item.feature_importance || []).map(f => f.importance), 0.001)

  return (
    <div className="ai-sidebar">
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div className="label-xs">Threat Intel</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
          {getTitle(item)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {item.type.replace('_', ' ').toUpperCase()} Alert
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Key metrics */}
        <div>
          <div className="label-xs" style={{ marginBottom: 8 }}>Anomaly Characteristics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {item.type === 'crime_spike' && [
              { label: 'Observed FIRs', value: item.value?.toLocaleString() },
              { label: 'Expected Baseline', value: item.expected?.toFixed(1) },
              { label: 'Sigma Deviation', value: `+${item.z_score} σ`, color: 'var(--critical)' },
              { label: 'Threat Severity', value: item.severity, color: item.severity === 'CRITICAL' ? 'var(--critical)' : 'var(--warning)' }
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 11, color: m.color || 'var(--text-primary)', fontWeight: 600 }}>{m.value}</span>
              </div>
            ))}

            {item.type === 'financial_anomaly' && [
              { label: 'Tx Volume', value: fmt(item.amount) },
              { label: 'Velocity Metric', value: item.velocity_score },
              { label: 'Spatial Anomaly', value: item.geo_anomaly_score },
              { label: 'Known Fraud Flag', value: item.is_fraud ? 'TRUE' : 'FALSE', color: item.is_fraud ? 'var(--critical)' : undefined },
              { label: 'Threat Severity', value: item.severity, color: item.severity === 'CRITICAL' ? 'var(--critical)' : 'var(--warning)' }
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 11, color: m.color || 'var(--text-primary)', fontWeight: 600 }}>{m.value}</span>
              </div>
            ))}

            {item.type === 'district_outlier' && [
              { label: 'Isolation Score', value: item.anomaly_score, color: 'var(--warning)' },
              { label: 'Crime Rate / 100K', value: item.crime_rate_per_100k?.toFixed(1) },
              { label: 'District Literacy', value: `${item.literacy_rate?.toFixed(1)}%` },
              { label: 'Threat Severity', value: item.severity, color: item.severity === 'CRITICAL' ? 'var(--critical)' : 'var(--warning)' }
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 11, color: m.color || 'var(--text-primary)', fontWeight: 600 }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model Confidence */}
        <div>
          <div className="label-xs" style={{ marginBottom: 6 }}>Model Confidence</div>
          <div className="risk-bar-wrap">
            <div
              className={`risk-bar-fill ${item.severity === 'CRITICAL' ? 'critical' : item.severity === 'HIGH' ? 'warning' : 'success'}`}
              style={{ width: `${(item.confidence || 0.8) * 100}%` }}
            />
          </div>
        </div>

        {/* Feature importance */}
        {item.feature_importance?.length > 0 && (
          <div>
            <div className="label-xs" style={{ marginBottom: 8 }}>Outlier Attribution</div>
            {item.feature_importance.map(f => (
              <div key={f.feature} className="xai-feature-row">
                <div className="xai-feature-name" style={{ fontSize: 9 }}>{f.feature}</div>
                <div className="xai-feature-bar-wrap">
                  <div className="xai-feature-bar" style={{ width: `${(f.importance / maxImp) * 100}%` }} />
                </div>
                <div className="xai-feature-pct">{Math.round(f.importance * 100)}%</div>
              </div>
            ))}
          </div>
        )}

        {/* Explanation */}
        <div>
          <div className="label-xs" style={{ marginBottom: 6 }}>AI Threat Explanation</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {item.explanation}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AIAnomalies() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filterType, setFilterType] = useState('all')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetch(`${API}/anomalies`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        setData(d)
        setLoading(false)
        if (d.length > 0) {
          setSelected(d[0])
        }
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div className="loading-container">
      <div className="spinner" />
      <span style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Loading threat anomaly feed…</span>
    </div>
  )
  if (error) return <div className="error-banner">ERROR: {error}</div>

  const filteredData = data.filter(item => {
    // Search query filter
    const matchesSearch = getTitle(item).toLowerCase().includes(searchQuery.toLowerCase()) ||
      getSubtitle(item).toLowerCase().includes(searchQuery.toLowerCase())
    
    // Type filter
    const matchesType = filterType === 'all' || item.type === filterType
    
    // Severity filter
    const matchesSeverity = filterSeverity === 'all' || item.severity === filterSeverity

    return matchesSearch && matchesType && matchesSeverity
  })

  return (
    <div className="ai-layout">
      {/* KPI Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Active Anomalies</div>
          <div className="kpi-value">{data.length}</div>
          <div className="kpi-sub">Total threat alerts detected</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Critical Spikes</div>
          <div className="kpi-value" style={{ color: 'var(--critical)' }}>
            {data.filter(a => a.severity === 'CRITICAL').length}
          </div>
          <div className="kpi-sub">Immediate action required</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">High Severity Outliers</div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>
            {data.filter(a => a.severity === 'HIGH').length}
          </div>
          <div className="kpi-sub">Demographic/financial anomalies</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Threat Classifiers</div>
          <div className="kpi-value" style={{ fontSize: 14, letterSpacing: 0 }}>IForest + z-Score</div>
          <div className="kpi-sub mono">Statistical sigma filters</div>
        </div>
      </div>

      {/* Main Body */}
      <div className="ai-split">
        {/* Left Side: Scrollable Feed */}
        <div className="ai-main" style={{ flex: 1.2, borderRight: '1px solid var(--border)' }}>
          {/* Controls header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, background: 'var(--bg-panel)' }}>
            <div style={{ flex: 2 }}>
              <div className="label-xs" style={{ marginBottom: 4 }}>Filter Query</div>
              <input
                type="text"
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="text-input"
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <div className="label-xs" style={{ marginBottom: 4 }}>Alert Type</div>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  padding: '5px 8px',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  outline: 'none'
                }}
              >
                <option value="all">All Types</option>
                <option value="crime_spike">Crime Spikes</option>
                <option value="financial_anomaly">Financial Outliers</option>
                <option value="district_outlier">District Outliers</option>
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <div className="label-xs" style={{ marginBottom: 4 }}>Severity</div>
              <select
                value={filterSeverity}
                onChange={e => setFilterSeverity(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  padding: '5px 8px',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  outline: 'none'
                }}
              >
                <option value="all">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
              </select>
            </div>
          </div>

          {/* Scrollable list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredData.length === 0 ? (
              <div style={{ padding: '24px', textalign: 'center', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                No active anomalies match selected filters
              </div>
            ) : (
              filteredData.map((item, index) => {
                let severityClass = 'medium'
                if (item.severity === 'CRITICAL') severityClass = 'critical'
                else if (item.severity === 'HIGH') severityClass = 'warning'

                const isSelected = selected && (
                  (selected.type === 'crime_spike' && item.type === 'crime_spike' && selected.district === item.district && selected.month === item.month) ||
                  (selected.type === 'financial_anomaly' && item.type === 'financial_anomaly' && selected.transaction_id === item.transaction_id) ||
                  (selected.type === 'district_outlier' && item.type === 'district_outlier' && selected.district === item.district)
                )

                return (
                  <div
                    key={index}
                    className={`anomaly-item ${severityClass} ${isSelected ? 'selected' : ''}`}
                    style={{ background: isSelected ? 'var(--bg-row-hover)' : undefined }}
                    onClick={() => setSelected(item)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span className="anomaly-type-tag">{item.type.replace('_', ' ')}</span>
                      <span className="mono" style={{ fontSize: 9, color: `var(--${severityClass === 'critical' ? 'critical' : severityClass === 'warning' ? 'warning' : 'text-muted'})` }}>
                        {item.severity}
                      </span>
                    </div>
                    <div className="anomaly-title">{getTitle(item)}</div>
                    <div className="anomaly-meta">{getSubtitle(item)}</div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Side: Detailed metrics details */}
        <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: 14 }}>
          {selected ? (
            <>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <div className="label-xs">Anomaly Threat Focus</div>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>{getTitle(selected)}</h2>
              </div>

              {selected.type === 'crime_spike' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    A significant statistical spike was detected in the monthly crime reporting volume for <b>{selected.district}</b>. The actual reporting rate deviates drastically from historical district seasonal baselines.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                      <div className="label-xs">Observed Volume</div>
                      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--critical)' }}>{selected.value}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>FIRs in {selected.month}</div>
                    </div>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                      <div className="label-xs">Historical Baseline</div>
                      <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{selected.expected?.toFixed(1)}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Expected mean value</div>
                    </div>
                  </div>
                </div>
              )}

              {selected.type === 'financial_anomaly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    High-velocity financial transfer detected. Transaction properties deviate from standard operational envelopes and node topology rules.
                  </p>
                  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                    <div className="label-xs">Transaction ID</div>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 600, wordBreak: 'break-all', color: 'var(--text-primary)' }}>{selected.transaction_id}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                      <div className="label-xs">Sender Account</div>
                      <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)' }}>{selected.sender}</div>
                    </div>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                      <div className="label-xs">Receiver Account</div>
                      <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)' }}>{selected.receiver}</div>
                    </div>
                  </div>
                </div>
              )}

              {selected.type === 'district_outlier' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <b>{selected.district}</b> has been flagged by the Isolation Forest model as a multi-dimensional demographic/crime outlier. Features such as population size, literacy rate, and crime per 100K are in atypical ratios.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                      <div className="label-xs">Outlier Decision Score</div>
                      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--warning)' }}>{selected.anomaly_score}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Lower is more anomalous</div>
                    </div>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                      <div className="label-xs">Crime Rate / 100K</div>
                      <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{selected.crime_rate_per_100k?.toFixed(1)}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Karnataka District Mean: 124.5</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              Select an alert to analyze
            </div>
          )}
        </div>

        {/* XAI Panel */}
        <XAIPanel item={selected} />
      </div>
    </div>
  )
}
