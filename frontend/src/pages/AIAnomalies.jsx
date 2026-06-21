import { useState, useEffect } from 'react'
import { getApiBaseUrl } from '../config'
import Topbar from '../components/Topbar.jsx'
import KPICard from '../components/KPICard.jsx'

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
    <div className="ai-sidebar" style={{ width: 220, minWidth: 220 }}>
      <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', marginTop: 40 }}>
        <i className="ti ti-hexagons" style={{ fontSize: 18, color: 'var(--text-ghost)', display: 'block', marginBottom: 8 }} />
        Select an anomaly alert to view AI threat analysis
      </div>
    </div>
  )

  const maxImp = Math.max(...(item.feature_importance || []).map(f => f.importance), 0.001)

  return (
    <div className="ai-sidebar" style={{ width: 220, minWidth: 220 }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div className="label-xs" style={{ fontSize: 8 }}>Threat Intel</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginTop: 4 }}>
          {getTitle(item)}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
          {item.type.replace('_', ' ').toUpperCase()} ALERT
        </div>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Key metrics */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Anomaly Characteristics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {item.type === 'crime_spike' && [
              { label: 'Observed FIRs', value: item.value?.toLocaleString() },
              { label: 'Expected Baseline', value: item.expected?.toFixed(1) },
              { label: 'Sigma Deviation', value: `+${item.z_score} σ`, color: 'var(--accent)' },
              { label: 'Threat Severity', value: item.severity, color: item.severity === 'CRITICAL' ? 'var(--accent)' : 'var(--text-secondary)' }
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 10, color: m.color || 'var(--text-primary)', fontWeight: 500 }}>{m.value}</span>
              </div>
            ))}

            {item.type === 'financial_anomaly' && [
              { label: 'Tx Volume', value: fmt(item.amount) },
              { label: 'Velocity Metric', value: item.velocity_score },
              { label: 'Spatial Anomaly', value: item.geo_anomaly_score },
              { label: 'Known Fraud Flag', value: item.is_fraud ? 'TRUE' : 'FALSE', color: item.is_fraud ? 'var(--accent)' : undefined },
              { label: 'Threat Severity', value: item.severity, color: item.severity === 'CRITICAL' ? 'var(--accent)' : 'var(--text-secondary)' }
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 10, color: m.color || 'var(--text-primary)', fontWeight: 500 }}>{m.value}</span>
              </div>
            ))}

            {item.type === 'district_outlier' && [
              { label: 'Isolation Score', value: item.anomaly_score, color: 'var(--text-secondary)' },
              { label: 'Crime Rate / 100K', value: item.crime_rate_per_100k?.toFixed(1) },
              { label: 'District Literacy', value: `${item.literacy_rate?.toFixed(1)}%` },
              { label: 'Threat Severity', value: item.severity, color: item.severity === 'CRITICAL' ? 'var(--accent)' : 'var(--text-secondary)' }
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 10, color: m.color || 'var(--text-primary)', fontWeight: 500 }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model Confidence */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Model Confidence</div>
          <div style={{ height: 2, background: 'var(--border)', position: 'relative' }}>
            <div
              style={{
                height: 2,
                width: `${(item.confidence || 0.8) * 100}%`,
                background: item.severity === 'CRITICAL' ? 'var(--accent)' : 'var(--text-muted)'
              }}
            />
          </div>
        </div>

        {/* Feature importance */}
        {item.feature_importance?.length > 0 && (
          <div>
            <div className="label-xs" style={{ fontSize: 8, marginBottom: 8 }}>Outlier Attribution</div>
            {item.feature_importance.map(f => (
              <div key={f.feature} className="xai-feature-row">
                <div className="xai-feature-name" style={{ fontSize: 8.5 }}>{f.feature}</div>
                <div className="xai-feature-bar-wrap">
                  <div className="xai-feature-bar" style={{ width: `${(f.importance / maxImp) * 100}%` }} />
                </div>
                <div className="xai-feature-pct" style={{ fontSize: 8.5 }}>{Math.round(f.importance * 100)}%</div>
              </div>
            ))}
          </div>
        )}

        {/* Explanation */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Threat Rationale</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
    <div className="page-loader">
      <div className="loader-ring" />
    </div>
  )
  if (error) return (
    <div className="empty-state">
      <i className="ti ti-alert-triangle empty-icon" style={{ color: 'var(--accent)' }} />
      <span className="empty-msg">Error loading anomalies model: {error}</span>
    </div>
  )

  const filteredData = data.filter(item => {
    const matchesSearch = getTitle(item).toLowerCase().includes(searchQuery.toLowerCase()) ||
      getSubtitle(item).toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = filterType === 'all' || item.type === filterType
    const matchesSeverity = filterSeverity === 'all' || item.severity === filterSeverity
    return matchesSearch && matchesType && matchesSeverity
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar
        title="AI Threat & Anomaly Feed"
        meta="ISOLATION FOREST & STATISTICAL SIGMA SCANNER"
        controls={null}
      />

      <div className="ai-layout" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'auto', overflow: 'hidden' }}>
        {/* KPI Row */}
        <div className="kpi-grid">
          <KPICard
            value={data.length}
            label="Active Anomalies"
            sub="Statistically flagged occurrences"
          />
          <KPICard
            value={data.filter(a => a.severity === 'CRITICAL').length}
            label="Critical Incidents"
            sub="Z-score deviation above 3.0"
          />
          <KPICard
            value={data.filter(a => a.severity === 'HIGH').length}
            label="High Threat Outliers"
            sub="Multidimensional isolation alerts"
          />
          <KPICard
            value="IForest + Z-Score"
            label="Active Model Stack"
            sub="Continuous transaction scan"
          />
        </div>

        {/* Main Body */}
        <div className="ai-split" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Side: Scrollable Feed */}
          <div className="ai-main" style={{ flex: 1.2, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            {/* Controls header */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, background: 'var(--bg-panel)' }}>
              <div style={{ flex: 2 }}>
                <div className="label-xs" style={{ fontSize: 8, marginBottom: 4 }}>Filter Query</div>
                <input
                  type="text"
                  placeholder="Search alerts..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="tb-select"
                  style={{ width: '100%', padding: '6px 8px', textTransform: 'none' }}
                />
              </div>

              <div style={{ flex: 1 }}>
                <div className="label-xs" style={{ fontSize: 8, marginBottom: 4 }}>Alert Type</div>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="tb-select"
                  style={{ width: '100%', padding: '5px' }}
                >
                  <option value="all">All Types</option>
                  <option value="crime_spike">Crime Spikes</option>
                  <option value="financial_anomaly">Financial Outliers</option>
                  <option value="district_outlier">District Outliers</option>
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <div className="label-xs" style={{ fontSize: 8, marginBottom: 4 }}>Severity</div>
                <select
                  value={filterSeverity}
                  onChange={e => setFilterSeverity(e.target.value)}
                  className="tb-select"
                  style={{ width: '100%', padding: '5px' }}
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
                <div className="empty-state">
                  <i className="ti ti-activity empty-icon" />
                  <span className="empty-msg">No active anomalies match selected filters</span>
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
                      style={{ background: isSelected ? 'var(--accent-sub)' : undefined }}
                      onClick={() => setSelected(item)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span className="anomaly-type-tag" style={{ fontSize: 7.5 }}>{item.type.replace('_', ' ')}</span>
                        <span className="mono" style={{ fontSize: 9, color: item.severity === 'CRITICAL' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {item.severity}
                        </span>
                      </div>
                      <div className="anomaly-title" style={{ fontSize: 11, fontWeight: 500 }}>{getTitle(item)}</div>
                      <div className="anomaly-meta" style={{ fontSize: 8.5 }}>{getSubtitle(item)}</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Side: Detailed metrics details */}
          <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: 14, background: 'var(--bg-base)' }}>
            {selected ? (
              <>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  <div className="label-xs" style={{ fontSize: 8 }}>Anomaly Threat Focus</div>
                  <h2 style={{ fontSize: 16, fontWeight: 500, marginTop: 4, color: 'var(--text-primary)', textTransform: 'uppercase' }}>{getTitle(selected)}</h2>
                </div>

                {selected.type === 'crime_spike' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      A significant statistical spike was detected in the monthly crime reporting volume for <b>{selected.district}</b>. The actual reporting rate deviates drastically from historical district seasonal baselines.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                        <div className="label-xs" style={{ fontSize: 8 }}>Observed Volume</div>
                        <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--accent)' }}>{selected.value}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>FIRs in {selected.month}</div>
                      </div>
                      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                        <div className="label-xs" style={{ fontSize: 8 }}>Historical Baseline</div>
                        <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{selected.expected?.toFixed(1)}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Expected mean value</div>
                      </div>
                    </div>
                  </div>
                )}

                {selected.type === 'financial_anomaly' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      High-velocity financial transfer detected. Transaction properties deviate from standard operational envelopes and node topology rules.
                    </p>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                      <div className="label-xs" style={{ fontSize: 8 }}>Transaction ID</div>
                      <div className="mono" style={{ fontSize: 11, fontWeight: 500, wordBreak: 'break-all', color: 'var(--text-primary)' }}>{selected.transaction_id}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                        <div className="label-xs" style={{ fontSize: 8 }}>Sender Account</div>
                        <div className="mono" style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--accent)' }}>{selected.sender}</div>
                      </div>
                      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                        <div className="label-xs" style={{ fontSize: 8 }}>Receiver Account</div>
                        <div className="mono" style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--text-secondary)' }}>{selected.receiver}</div>
                      </div>
                    </div>
                  </div>
                )}

                {selected.type === 'district_outlier' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <b>{selected.district}</b> has been flagged by the Isolation Forest model as a multi-dimensional demographic/crime outlier. Features such as population size, literacy rate, and crime per 100K are in atypical ratios.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                        <div className="label-xs" style={{ fontSize: 8 }}>Outlier Decision Score</div>
                        <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-secondary)' }}>{selected.anomaly_score}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Lower is more anomalous</div>
                      </div>
                      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                        <div className="label-xs" style={{ fontSize: 8 }}>Crime Rate / 100K</div>
                        <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{selected.crime_rate_per_100k?.toFixed(1)}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Karnataka District Mean: 124.5</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div className="empty-state">
                  <i className="ti ti-activity empty-icon" />
                  <span className="empty-msg">Select an anomaly alert to inspect characteristics</span>
                </div>
              </div>
            )}
          </div>

          {/* XAI Panel */}
          <XAIPanel item={selected} />
        </div>
      </div>
    </div>
  )
}
