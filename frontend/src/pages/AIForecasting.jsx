import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { getApiBaseUrl } from '../config'
import Topbar from '../components/Topbar.jsx'
import KPICard from '../components/KPICard.jsx'

const API = `${getApiBaseUrl()}/api/v1/ai`

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 3, padding: '10px 14px', fontSize: 11 }}>
      <div style={{ fontWeight: 500, marginBottom: 6, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text-secondary)', marginBottom: 2, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}:</span>
          <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 500 }}>{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function XAIPanel({ item }) {
  if (!item) return (
    <div className="ai-sidebar" style={{ width: 220, minWidth: 220 }}>
      <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', marginTop: 40 }}>
        <i className="ti ti-hexagons" style={{ fontSize: 18, color: 'var(--text-ghost)', display: 'block', marginBottom: 8 }} />
        Select a district to view AI explanations
      </div>
    </div>
  )

  const maxImp = Math.max(...(item.feature_importance || []).map(f => f.importance), 0.001)

  return (
    <div className="ai-sidebar" style={{ width: 220, minWidth: 220 }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div className="label-xs" style={{ fontSize: 8 }}>Explainable AI</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginTop: 4, textTransform: 'uppercase' }}>
          {item.district}
        </div>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Key metrics */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Forecast Parameters</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Predicted FIRs', value: item.predicted_firs?.toLocaleString() },
              { label: 'Current FIRs',   value: item.current_firs?.toLocaleString() },
              { label: 'Risk Index',     value: `${item.risk_score}/100` },
              { label: 'Model Conf.',    value: `${Math.round((item.confidence || 0) * 100)}%` },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 500 }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk bar */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Composite Risk Index</div>
          <div style={{ height: 2, background: 'var(--border)', position: 'relative' }}>
            <div
              style={{
                height: 2,
                width: `${item.risk_score}%`,
                background: item.risk_score > 60 ? 'var(--accent)' : 'var(--text-muted)'
              }}
            />
          </div>
        </div>

        {/* Feature importance */}
        {item.feature_importance?.length > 0 && (
          <div>
            <div className="label-xs" style={{ fontSize: 8, marginBottom: 8 }}>Feature Weights</div>
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
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Model Rationale</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
    <div className="page-loader">
      <div className="loader-ring" />
    </div>
  )
  if (error) return (
    <div className="empty-state">
      <i className="ti ti-alert-triangle empty-icon" style={{ color: 'var(--accent)' }} />
      <span className="empty-msg">Error loading forecasting model: {error}</span>
    </div>
  )

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

  const growthChange = ss.growth_percent !== undefined ? ss.growth_percent : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar
        title="AI Crime Forecasting — Karnataka"
        meta="RANDOM FOREST REGRESSION · FORECAST DEPTH: 1 MONTH"
        controls={null}
      />

      <div className="ai-layout" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'auto', overflow: 'hidden' }}>
        {/* KPI Row */}
        <div className="kpi-grid">
          <KPICard
            value={ss.predicted_total?.toLocaleString()}
            label="State Predicted Total"
            sub={`Current month base: ${ss.current_total?.toLocaleString()}`}
            change={growthChange}
          />
          <KPICard
            value={districts.length}
            label="Districts Monitored"
            sub="All active jurisdiction models"
          />
          <KPICard
            value={districts.filter(d => d.risk_score > 60).length}
            label="High-Risk Sectors"
            sub="Risk index score above 60/100"
          />
          <KPICard
            value="RandomForest"
            label="Active ML Estimator"
            sub="RMSE 10.514 · Baseline: 35.6s"
          />
        </div>

        <div className="ai-split" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div className="ai-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--bg-base)' }}>
            {/* Bar chart */}
            <div style={{ padding: '20px 24px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Top 10 Predicted Volumes next month</h3>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>ESTIMATED CASE LOAD DISTRIBUTION</div>
              </div>
              <div style={{ height: 150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 8 }} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={v => v.toLocaleString()} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)', opacity: 0.3 }} />
                    <Bar dataKey="predicted" name="Predicted FIRs" maxBarSize={16}>
                      {chartData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.predicted > d.current * 1.05 ? 'var(--accent)' : 'var(--text-secondary)'}
                          opacity={d.predicted > d.current * 1.05 ? 0.95 : 0.5}
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="current" name="Current FIRs" fill="var(--text-dim)" opacity={0.3} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 14px', marginTop: 14 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th onClick={() => toggleSort('district')} style={{ cursor: 'pointer' }}>
                      District {sortField === 'district' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => toggleSort('current_firs')} style={{ cursor: 'pointer' }}>
                      Current {sortField === 'current_firs' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => toggleSort('predicted_firs')} style={{ cursor: 'pointer' }}>
                      Predicted {sortField === 'predicted_firs' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => toggleSort('risk_score')} style={{ cursor: 'pointer' }}>
                      Risk Score {sortField === 'risk_score' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ width: 60, textAlign: 'center' }}>Trend</th>
                    <th onClick={() => toggleSort('confidence')} style={{ cursor: 'pointer' }}>
                      Confidence {sortField === 'confidence' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {districts.map((d, i) => {
                    const delta = d.predicted_firs - d.current_firs
                    const isIncrease = delta > 0
                    return (
                      <tr
                        key={d.district}
                        className={selected?.district === d.district ? 'selected' : ''}
                        onClick={() => setSelected(d)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="mono text-muted">{i + 1}</td>
                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{d.district}</td>
                        <td className="mono">{d.current_firs.toLocaleString()}</td>
                        <td className="mono" style={{ color: isIncrease ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {isIncrease ? '+' : ''}{delta.toFixed(0)} ({Math.round(d.predicted_firs).toLocaleString()})
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ height: 2, background: 'var(--border)', width: 50, position: 'relative' }}>
                              <div style={{
                                height: 2,
                                background: d.risk_score > 60 ? 'var(--accent)' : 'var(--text-muted)',
                                width: `${d.risk_score}%`
                              }} />
                            </div>
                            <span className="mono" style={{ fontSize: 9, color: d.risk_score > 60 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                              {d.risk_score}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isIncrease ? (
                            <i className="ti ti-trending-up" style={{ color: 'var(--accent)', fontSize: 12 }} />
                          ) : (
                            <i className="ti ti-trending-down" style={{ color: 'var(--text-muted)', fontSize: 12 }} />
                          )}
                        </td>
                        <td className="mono" style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>
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
    </div>
  )
}
