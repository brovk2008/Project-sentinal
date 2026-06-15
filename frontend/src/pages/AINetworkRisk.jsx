import { useState, useEffect, useRef, useCallback } from 'react'
import { Network } from 'vis-network/standalone'
import { getApiBaseUrl } from '../config'

const API = `${getApiBaseUrl()}/api/v1/ai`

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return '₹' + (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return '₹' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return '₹' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function riskColor(risk) {
  if (risk >= 80) return '#EF4444' // critical
  if (risk >= 50) return '#F59E0B' // warning
  return '#22C55E' // success
}

function XAIPanel({ item, detail }) {
  if (!item) return (
    <div className="ai-sidebar">
      <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 11 }}>
        Select an account to view AI threat analysis
      </div>
    </div>
  )

  const explanation = detail?.explanation || item.explanation || ''
  const confidence = detail?.confidence || item.confidence || 0.90
  const feature_importance = detail?.feature_importance || item.feature_importance || []
  const maxImp = Math.max(...feature_importance.map(f => f.importance), 0.001)

  return (
    <div className="ai-sidebar">
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div className="label-xs">Risk Scan</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4, fontFamily: 'JetBrains Mono' }}>
          {item.account_number}
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Key metrics */}
        <div>
          <div className="label-xs" style={{ marginBottom: 8 }}>Entity Metrics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Risk Score', value: `${item.risk_score}/100`, color: riskColor(item.risk_score) },
              { label: 'Total Volume', value: fmt(item.total_amount) },
              { label: 'Transactions', value: item.tx_count },
              { label: 'Avg Velocity', value: item.avg_velocity?.toFixed(2) },
              { label: 'Model Confidence', value: `${Math.round(confidence * 100)}%` }
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifycontent: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 11, color: m.color || 'var(--text-primary)', fontWeight: 600 }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Bar */}
        <div>
          <div className="label-xs" style={{ marginBottom: 6 }}>Laundering Risk</div>
          <div className="risk-bar-wrap">
            <div
              className={`risk-bar-fill ${item.risk_score >= 80 ? 'critical' : item.risk_score >= 50 ? 'warning' : 'success'}`}
              style={{ width: `${item.risk_score}%` }}
            />
          </div>
        </div>

        {/* Graph topology metrics */}
        {detail?.metrics && (
          <div>
            <div className="label-xs" style={{ marginBottom: 8 }}>Subnetwork Topology</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Transitive Loops', value: detail.metrics.cycles_count, color: detail.metrics.cycles_count > 0 ? 'var(--critical)' : undefined },
                { label: 'Direct In-Degree', value: detail.metrics.in_degree },
                { label: 'Direct Out-Degree', value: detail.metrics.out_degree },
                { label: 'Mule Neighbors', value: detail.metrics.fraud_neighbors, color: detail.metrics.fraud_neighbors > 0 ? 'var(--warning)' : undefined }
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</span>
                  <span className="mono" style={{ fontSize: 11, color: m.color || 'var(--text-primary)', fontWeight: 600 }}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feature importance */}
        {feature_importance.length > 0 && (
          <div>
            <div className="label-xs" style={{ marginBottom: 8 }}>Top Attack Vectors</div>
            {feature_importance.map(f => (
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
        {explanation && (
          <div>
            <div className="label-xs" style={{ marginBottom: 6 }}>AI Threat Explanation</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
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

  const graphRef = useRef(null)
  const netInst = useRef(null)

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

  // vis-network configuration
  const buildOptions = () => ({
    nodes: {
      shape: 'dot',
      scaling: { min: 8, max: 28 },
      font: { color: '#9CA3AF', size: 9, face: 'Inter' },
      borderWidth: 1.5,
      borderWidthSelected: 2.5,
      shadow: false
    },
    edges: {
      arrows: { to: { enabled: true, scaleFactor: 0.4 } },
      color: { color: '#2A2A2A', highlight: '#F5F5F5', hover: '#F5F5F5' },
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
  })

  // Render network graph
  const renderGraph = useCallback(() => {
    if (!graphRef.current || !selectedDetail) return
    if (netInst.current) {
      netInst.current.destroy()
    }

    const { nodes, edges, account_number } = selectedDetail

    const visNodes = nodes.map(n => {
      const isTarget = n.id === account_number
      return {
        id: n.id,
        label: isTarget ? `[TARGET]` : n.label,
        title: `Account: ${n.id}\nRisk Score: ${n.risk}`,
        size: isTarget ? 24 : n.size,
        color: {
          background: riskColor(n.risk),
          border: isTarget ? '#F5F5F5' : riskColor(n.risk),
          highlight: { background: '#F5F5F5', border: '#FFFFFF' }
        },
        font: {
          color: isTarget ? '#F5F5F5' : '#9CA3AF',
          size: isTarget ? 11 : 9,
          face: 'Inter',
          strokeWidth: isTarget ? 1 : 0,
          strokeColor: '#000'
        }
      }
    })

    const visEdges = edges.map((e, index) => ({
      id: index,
      from: e.from,
      to: e.to,
      value: e.amount,
      title: `Amount: ${fmt(e.amount)}\nFraud Flag: ${e.is_fraud ? 'YES' : 'NO'}`,
      color: e.is_fraud ? '#EF4444' : '#2A2A2A',
      width: e.is_fraud ? 2 : 1
    }))

    netInst.current = new Network(
      graphRef.current,
      { nodes: visNodes, edges: visEdges },
      buildOptions()
    )
  }, [selectedDetail])

  // Call render when detail is loaded
  useEffect(() => {
    renderGraph()
  }, [renderGraph])

  if (loading) return (
    <div className="loading-container">
      <div className="spinner" />
      <span style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Loading transaction graph model…</span>
    </div>
  )
  if (error) return <div className="error-banner">ERROR: {error}</div>

  const filteredData = data.filter(item =>
    item.account_number.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="ai-layout">
      {/* KPI Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Accounts Scanned</div>
          <div className="kpi-value">{data.length}</div>
          <div className="kpi-sub">Target accounts analyzed</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Anomaly Detected</div>
          <div className="kpi-value" style={{ color: 'var(--critical)' }}>
            {data.filter(a => a.risk_score >= 80).length}
          </div>
          <div className="kpi-sub">Risk Score &gt;= 80</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Warning Entities</div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>
            {data.filter(a => a.risk_score >= 50 && a.risk_score < 80).length}
          </div>
          <div className="kpi-sub">Risk Score 50 - 80</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Risk Detector</div>
          <div className="kpi-value" style={{ fontSize: 14, letterSpacing: 0 }}>IsolationForest</div>
          <div className="kpi-sub mono">Contamination 5% · 11.3M Tx</div>
        </div>
      </div>

      <div className="ai-split">
        {/* Risk Scanner List */}
        <div className="ai-main" style={{ flex: 0.8, borderRight: '1px solid var(--border)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="label-xs">High-Risk Suspicious Scan</div>
            <input
              type="text"
              placeholder="Search account number..."
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

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Total Vol</th>
                  <th>Txs</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(item => {
                  const riskColorClass = item.risk_score >= 80 ? 'text-critical' : item.risk_score >= 50 ? 'text-warning' : 'text-success'
                  return (
                    <tr
                      key={item.account_number}
                      className={selected?.account_number === item.account_number ? 'selected' : ''}
                      onClick={() => setSelected(item)}
                    >
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono', fontSize: 11 }}>
                        {item.account_number}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{fmt(item.total_amount)}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{item.tx_count}</td>
                      <td className={`mono ${riskColorClass}`} style={{ fontWeight: 700, fontSize: 11 }}>
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
        <div style={{ flex: 1.2, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 16px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="label-xs">Subgraph Analysis Model</div>
            {loadingDetail && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Updating subnetwork...</span>}
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <div ref={graphRef} style={{ width: '100%', height: '100%', background: 'var(--bg-primary)' }} />
          </div>
        </div>

        {/* XAI Details Sidebar */}
        <XAIPanel item={selected} detail={selectedDetail} />
      </div>
    </div>
  )
}
