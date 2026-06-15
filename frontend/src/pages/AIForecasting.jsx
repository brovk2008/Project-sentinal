import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { getApiBaseUrl } from '../config'

const API = `${getApiBaseUrl()}/api/v1/ai`

function XAIPanel({ item }) {
  if (!item) return (
    <div className="ai-sidebar">
      <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 11 }}>
        Select a district to view AI explanation
      </div>
    </div>
  )

  const maxImp = Math.max(...(item.feature_importance || []).map(f => f.importance), 0.001)

  return (
    <div className="ai-sidebar">
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div className="label-xs">XAI Analysis</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
          {item.district}
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Key metrics */}
        <div>
          <div className="label-xs" style={{ marginBottom: 8 }}>Forecast Metrics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Predicted FIRs', value: item.predicted_firs?.toLocaleString() },
              { label: 'Current FIRs',   value: item.current_firs?.toLocaleString() },
              { label: 'Risk Score',     value: `${item.risk_score}/100` },
              { label: 'Confidence',     value: `${Math.round((item.confidence || 0) * 100)}%` },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk bar */}
        <div>
          <div className="label-xs" style={{ marginBottom: 6 }}>Risk Score</div>
          <div className="risk-bar-wrap">
            <div
              className={`risk-bar-fill ${item.risk_score > 70 ? 'critical' : item.risk_score > 40 ? 'warning' : 'success'}`}
              style={{ width: `${item.risk_score}%` }}
            />
          </div>
        </div>

        {/* Feature importance */}
        {item.feature_importance?.length > 0 && (
          <div>
            <div className="label-xs" style={{ marginBottom: 8 }}>Feature Importance</div>
            {item.feature_importance.map(f => (
              <div key={f.feature} className="xai-feature-row">
                <div className="xai-feature-name">{f.feature}</div>
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
          <div className="label-xs" style={{ marginBottom: 6 }}>AI Explanation</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {item.explanation}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AIForecasting() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [sortField, setSortField] = useState('risk_score')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    fetch(`${API}/forecast/all`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="loading-container">
      <div className="spinner" />
      <span style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Loading forecast model…</span>
    </div>
  )
  if (error) return <div className="error-banner">ERROR: {error}</div>

  const ss = data?.state_summary || {}
  const districts = [...(data?.districts || [])].sort((a, b) => {
    const va = a[sortField] ?? 0, vb = b[sortField] ?? 0
    return sortDir === 'asc' ? va - vb : vb - va
  })

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  // Top 10 for bar chart
  const chartData = districts.slice(0, 10).map(d => ({
    name: d.district.split(' ')[0],
    predicted: Math.round(d.predicted_firs),
    current: d.current_firs,
  }))

  const trend = ss.growth_percent > 0 ? 'up' : ss.growth_percent < 0 ? 'down' : ''

  return (
    <div className="ai-layout">
      {/* KPI Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">State Predicted Next Month</div>
          <div className="kpi-value">{ss.predicted_total?.toLocaleString()}</div>
          <div className="kpi-sub">Current month: {ss.current_total?.toLocaleString()}</div>
          {ss.growth_percent !== undefined && (
            <div className={`kpi-change ${trend}`}>{ss.growth_percent > 0 ? '+' : ''}{ss.growth_percent}%</div>
          )}
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Districts Analysed</div>
          <div className="kpi-value">{districts.length}</div>
          <div className="kpi-sub">All Karnataka districts</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">High-Risk Districts</div>
          <div className="kpi-value" style={{ color: 'var(--critical)' }}>
            {districts.filter(d => d.risk_score > 60).length}
          </div>
          <div className="kpi-sub">Risk score &gt; 60</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Forecast Model</div>
          <div className="kpi-value" style={{ fontSize: 14, letterSpacing: 0 }}>RandomForest</div>
          <div className="kpi-sub mono">RMSE 10.51 · 35.6s train</div>
        </div>
      </div>

      <div className="ai-split">
        <div className="ai-main">
          {/* Bar chart */}
          <div style={{ padding: '14px 20px 0' }}>
            <div className="panel-header" style={{ padding: '10px 0', background: 'transparent', border: 'none' }}>
              <h3>Top 10 Districts by Predicted Volume</h3>
            </div>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 0, fontSize: 11 }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                  />
                  <Bar dataKey="predicted" name="Predicted" fill="var(--text-secondary)" maxBarSize={20}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.predicted > d.current * 1.1 ? 'var(--critical)' : d.predicted > d.current ? 'var(--warning)' : 'var(--success)'} />
                    ))}
                  </Bar>
                  <Bar dataKey="current" name="Current" fill="var(--border)" maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 14px', marginTop: 14 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th onClick={() => toggleSort('district')} style={{ cursor: 'pointer' }}>
                    District {sortField === 'district' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => toggleSort('current_firs')} style={{ cursor: 'pointer' }}>
                    Current {sortField === 'current_firs' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => toggleSort('predicted_firs')} style={{ cursor: 'pointer' }}>
                    Predicted {sortField === 'predicted_firs' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => toggleSort('risk_score')} style={{ cursor: 'pointer' }}>
                    Risk {sortField === 'risk_score' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th>Trend</th>
                  <th onClick={() => toggleSort('confidence')} style={{ cursor: 'pointer' }}>
                    Confidence {sortField === 'confidence' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {districts.map((d, i) => {
                  const delta = d.predicted_firs - d.current_firs
                  const riskClass = d.risk_score > 70 ? 'critical' : d.risk_score > 40 ? 'warning' : 'success'
                  return (
                    <tr
                      key={d.district}
                      className={selected?.district === d.district ? 'selected' : ''}
                      onClick={() => setSelected(d)}
                    >
                      <td className="mono text-muted">{i + 1}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.district}</td>
                      <td className="mono">{d.current_firs.toLocaleString()}</td>
                      <td className="mono" style={{ color: delta > 0 ? 'var(--critical)' : 'var(--success)' }}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(0)} ({d.predicted_firs.toLocaleString()})
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="risk-bar-wrap" style={{ width: 60 }}>
                            <div className={`risk-bar-fill ${riskClass}`} style={{ width: `${d.risk_score}%` }} />
                          </div>
                          <span className="mono" style={{ fontSize: 10, color: `var(--${riskClass === 'critical' ? 'critical' : riskClass === 'warning' ? 'warning' : 'success'})` }}>
                            {d.risk_score}
                          </span>
                        </div>
                      </td>
                      <td className={delta > 0 ? 'text-critical' : 'text-success'} style={{ fontSize: 14, fontWeight: 700 }}>
                        {delta > 0 ? '↑' : '↓'}
                      </td>
                      <td className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {Math.round((d.confidence || 0) * 100)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <XAIPanel item={selected} />
      </div>
    </div>
  )
}
