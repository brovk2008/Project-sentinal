import { useState, useEffect, useRef, useCallback } from 'react'
import { Network } from 'vis-network/standalone'
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

// Greyscale with copper for high laundering risk
function riskColor(risk) {
  if (risk >= 80) return 'var(--accent)' // Copper highlight
  if (risk >= 50) return 'var(--text-secondary)'
  return 'var(--text-muted)'
}

function XAIPanel({ item, detail }) {
  if (!item) return (
    <div className="ai-sidebar" style={{ width: 220, minWidth: 220 }}>
      <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', marginTop: 40 }}>
        <i className="ti ti-hexagons" style={{ fontSize: 18, color: 'var(--text-ghost)', display: 'block', marginBottom: 8 }} />
        Select an account to view AI threat analysis
      </div>
    </div>
  )

  const explanation = detail?.explanation || item.explanation || ''
  const confidence = detail?.confidence || item.confidence || 0.90
  const feature_importance = detail?.feature_importance || item.feature_importance || []
  const maxImp = Math.max(...feature_importance.map(f => f.importance), 0.001)

  return (
    <div className="ai-sidebar" style={{ width: 220, minWidth: 220 }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div className="label-xs" style={{ fontSize: 8 }}>Risk Scan</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginTop: 4, fontFamily: 'JetBrains Mono' }}>
          {item.account_number}
        </div>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Key metrics */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Entity Metrics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Risk Score', value: `${item.risk_score}/100`, color: riskColor(item.risk_score) },
              { label: 'Total Volume', value: fmt(item.total_amount) },
              { label: 'Transactions', value: item.tx_count },
              { label: 'Avg Velocity', value: item.avg_velocity?.toFixed(2) },
              { label: 'Model Conf.', value: `${Math.round(confidence * 100)}%` }
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 10, color: m.color || 'var(--text-primary)', fontWeight: 500 }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Bar */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Laundering Risk</div>
          <div style={{ height: 2, background: 'var(--border)', position: 'relative' }}>
            <div
              style={{
                height: 2,
                width: `${item.risk_score}%`,
                background: item.risk_score >= 80 ? 'var(--accent)' : 'var(--text-muted)'
              }}
            />
          </div>
        </div>

        {/* Graph topology metrics */}
        {detail?.metrics && (
          <div>
            <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Subnetwork Topology</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Transitive Loops', value: detail.metrics.cycles_count, color: detail.metrics.cycles_count > 0 ? 'var(--accent)' : undefined },
                { label: 'Direct In-Degree', value: detail.metrics.in_degree },
                { label: 'Direct Out-Degree', value: detail.metrics.out_degree },
                { label: 'Mule Neighbors', value: detail.metrics.fraud_neighbors }
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{m.label}</span>
                  <span className="mono" style={{ fontSize: 10, color: m.color || 'var(--text-primary)', fontWeight: 500 }}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feature importance */}
        {feature_importance.length > 0 && (
          <div>
            <div className="label-xs" style={{ fontSize: 8, marginBottom: 8 }}>Attack Vectors</div>
            {feature_importance.map(f => (
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
        {explanation && (
          <div>
            <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Threat Rationale</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {explanation}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AINetworkRisk() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')

  const graphRef = useRef(null)
  const netInst = useRef(null)

  useEffect(() => {
    const handleThemeChange = (e) => {
      setTheme(e.detail)
    }
    window.addEventListener('themechange', handleThemeChange)
    return () => window.removeEventListener('themechange', handleThemeChange)
  }, [])

  // Fetch scan list
  useEffect(() => {
    fetch(`${API}/network/scan`)
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

  // Fetch details for selected account
  useEffect(() => {
    if (!selected) return

    let active = true
    setTimeout(() => {
      if (active) setLoadingDetail(true)
    }, 0)

    fetch(`${API}/network/detail/${selected.account_number}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        if (!active) return
        setSelectedDetail(d)
        setLoadingDetail(false)
      })
      .catch(err => {
        console.error(err)
        if (active) setLoadingDetail(false)
      })

    return () => { active = false }
  }, [selected])

  // vis-network configuration responsive to theme variables
  const buildOptions = useCallback(() => {
    const isDark = theme === 'dark'
    const borderCol = isDark ? '#191a1f' : '#e2ddd8'
    const textCol = isDark ? '#efefef' : '#111110'
    const edgeCol = isDark ? '#1c1c22' : '#d8d3cd'

    return {
      nodes: {
        shape: 'dot',
        scaling: { min: 8, max: 24 },
        font: { color: textCol, size: 9, face: 'Inter' },
        borderWidth: 1.5,
        borderWidthSelected: 2.5,
        shadow: false
      },
      edges: {
        arrows: { to: { enabled: true, scaleFactor: 0.4 } },
        color: { color: edgeCol, highlight: 'var(--accent)', hover: 'var(--accent)' },
        smooth: { type: 'dynamic' },
        scaling: { min: 1, max: 4 },
        shadow: false
      },
      physics: {
        stabilization: { iterations: 100 },
        barnesHut: { gravitationalConstant: -4000, springLength: 100 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        hideEdgesOnDrag: true
      },
      layout: { randomSeed: 42 }
    }
  }, [theme])

  // Render network graph
  const renderGraph = useCallback(() => {
    if (!graphRef.current || !selectedDetail) return
    if (netInst.current) {
      netInst.current.destroy()
    }

    const { nodes, edges, account_number } = selectedDetail

    const visNodes = nodes.map(n => {
      const isTarget = n.id === account_number
      const color = riskColor(n.risk)
      return {
        id: n.id,
        label: isTarget ? `[TARGET]` : n.label,
        title: `Account: ${n.id}\nRisk: ${n.risk}`,
        size: isTarget ? 20 : n.size,
        color: {
          background: isTarget ? 'var(--accent)' : color,
          border: isTarget ? 'var(--text-primary)' : color,
          highlight: { background: 'var(--bg-elevated)', border: 'var(--accent)' }
        }
      }
    })

    const visEdges = edges.map((e, index) => ({
      id: index,
      from: e.from,
      to: e.to,
      value: e.amount,
      title: `Amount: ${fmt(e.amount)}\nFraud Flag: ${e.is_fraud ? 'YES' : 'NO'}`,
      color: e.is_fraud ? 'var(--accent)' : undefined,
      width: e.is_fraud ? 2.5 : 1
    }))

    netInst.current = new Network(
      graphRef.current,
      { nodes: visNodes, edges: visEdges },
      buildOptions()
    )
  }, [selectedDetail, buildOptions])

  // Call render when detail is loaded or theme changes
  useEffect(() => {
    renderGraph()
  }, [renderGraph, theme])

  if (loading) return (
    <div className="page-loader">
      <div className="loader-ring" />
    </div>
  )
  if (error) return (
    <div className="empty-state">
      <i className="ti ti-alert-triangle empty-icon" style={{ color: 'var(--accent)' }} />
      <span className="empty-msg">Error loading transaction graph: {error}</span>
    </div>
  )

  const filteredData = data.filter(item =>
    item.account_number.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar
        title="AI Financial Risk Scanning"
        meta="ISOLATION FOREST CONTAMINATION SCAN"
        controls={null}
      />

      <div className="ai-layout" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'auto', overflow: 'hidden' }}>
        {/* KPI Row */}
        <div className="kpi-grid">
          <KPICard
            value={data.length}
            label="Total Accounts Scanned"
            sub="Named transaction nodes scanned"
          />
          <KPICard
            value={data.filter(a => a.risk_score >= 80).length}
            label="Anomalies Found"
            sub="Risk score index >= 80/100"
          />
          <KPICard
            value={data.filter(a => a.risk_score >= 50 && a.risk_score < 80).length}
            label="Warning Entities"
            sub="Risk score index 50 - 80"
          />
          <KPICard
            value="Isolation Forest"
            label="ML Classifier"
            sub="Contamination rate: 5% threshold"
          />
        </div>

        <div className="ai-split" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Risk scanner list panel */}
          <div className="ai-main" style={{ flex: 0.8, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div className="label-xs" style={{ marginBottom: 6 }}>Suspicious Feed Search</div>
              <input
                type="text"
                placeholder="Search account ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="tb-select"
                style={{ width: '100%', padding: '6px 8px', textTransform: 'none' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account ID</th>
                    <th>Volume</th>
                    <th>Txs</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map(item => {
                    const isSelected = selected?.account_number === item.account_number
                    return (
                      <tr
                        key={item.account_number}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelected(item)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono', fontSize: 10.5 }}>
                          {item.account_number}
                        </td>
                        <td className="mono">{fmt(item.total_amount)}</td>
                        <td className="mono">{item.tx_count}</td>
                        <td className="mono" style={{ fontWeight: 500, color: item.risk_score >= 80 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {item.risk_score}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Network Graph Render Area */}
          <div style={{ flex: 1.2, position: 'relative', display: 'flex', flexDirection: 'column', background: 'var(--map-bg)' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)' }}>
              <div className="label-xs">Co-Offender Graph Subgraph</div>
              {loadingDetail && <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'JetBrains Mono' }}>SCANNING NEIGHBORS…</span>}
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <div ref={graphRef} style={{ width: '100%', height: '100%' }} />
            </div>
          </div>

          {/* Details Sidebar */}
          <XAIPanel item={selected} detail={selectedDetail} />
        </div>
      </div>
    </div>
  )
}
