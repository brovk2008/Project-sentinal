import { useState, useEffect, useRef, useCallback } from 'react'
import { Network } from 'vis-network/standalone'
import { getApiBaseUrl } from '../config'
import Topbar from '../components/Topbar.jsx'
import KPICard from '../components/KPICard.jsx'

const API = `${getApiBaseUrl()}/api/v1/network`

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return '₹' + (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return '₹' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

// Restrained risk color palette (greyscale with copper for high-risk)
function riskColor(score) {
  if (score >= 0.8) return 'var(--accent)' // Copper highlight for high risk
  if (score >= 0.6) return 'var(--text-secondary)'
  if (score >= 0.4) return 'var(--text-muted)'
  if (score >= 0.2) return 'var(--text-dim)'
  return 'var(--text-ghost)'
}

// Telecom company colors mapping
const COMPANY_COLORS = {
  'Jio': 'var(--accent)', // Copper highlight
  'Airtel': 'var(--text-secondary)',
  'Vi': 'var(--text-muted)',
  'BSNL': 'var(--text-dim)',
  'default': 'var(--text-ghost)'
}

export default function NetworkAnalysis() {
  const graphRef = useRef(null)
  const netInst = useRef(null)

  const [graphMode, setGraphMode] = useState('fraud') // fraud | cdr
  const [stats, setStats] = useState(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [traceAccount, setTraceAccount] = useState('')
  const [traceResult, setTraceResult] = useState(null)
  const [limit, setLimit] = useState(200)
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')

  useEffect(() => {
    const handleThemeChange = (e) => {
      setTheme(e.detail)
    }
    window.addEventListener('themechange', handleThemeChange)
    return () => window.removeEventListener('themechange', handleThemeChange)
  }, [])

  // Load KPI stats
  useEffect(() => {
    fetch(`${API}/stats`)
      .then(r => r.json())
      .then(data => { setStats(data) })
      .catch(() => {})
  }, [])

  // Build vis-network options responsive to theme variables
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
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        color: { color: edgeCol, highlight: 'var(--accent)', hover: 'var(--accent)' },
        smooth: { type: 'dynamic' },
        scaling: { min: 1, max: 4 },
        shadow: false
      },
      physics: {
        stabilization: { iterations: 120 },
        barnesHut: { gravitationalConstant: -6000, springLength: 100 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        hideEdgesOnDrag: true,
        navigationButtons: false,
        keyboard: false
      },
      layout: { randomSeed: 42 }
    }
  }, [theme])

  const renderGraph = useCallback((nodes, edges, mode) => {
    if (!graphRef.current) return
    if (netInst.current) { netInst.current.destroy() }

    const isDark = theme === 'dark'
    const bgCol = isDark ? '#0f1011' : '#faf9f7'
    const borderCol = isDark ? '#1c1c22' : '#d8d3cd'
    const textCol = isDark ? '#efefef' : '#111110'

    const visNodes = nodes.map(n => {
      const col = mode === 'fraud' ? riskColor(n.risk_score || 0) : (COMPANY_COLORS[n.company] || COMPANY_COLORS.default)
      return {
        id: n.id,
        label: mode === 'fraud'
          ? (n.owner && n.owner !== 'Unknown' ? n.owner.split(' ')[0] : n.id.slice(-6))
          : n.id.slice(-8),
        title: mode === 'fraud'
          ? `<div style="background:${bgCol};border:1px solid ${borderCol};border-radius:3px;padding:8px 10px;color:${textCol};font-size:10.5px;font-family:Inter;">
              <b style="color:var(--accent)">${n.owner || n.id}</b><br/>
              Bank: ${n.bank || '—'}<br/>
              Risk: <span style="font-family:JetBrains Mono;font-weight:500;">${(n.risk_score || 0).toFixed(2)}</span>
             </div>`
          : `<div style="background:${bgCol};border:1px solid ${borderCol};border-radius:3px;padding:6px 8px;color:${textCol};font-size:10.5px;font-family:Inter;">
              <b style="color:var(--accent)">${n.id}</b><br/>Company: ${n.company || '—'}
             </div>`,
        size: 7 + Math.min((n.val || 1) * 3, 20),
        color: {
          background: col,
          border: col,
          highlight: { background: 'var(--bg-elevated)', border: 'var(--accent)' }
        }
      }
    })

    const visEdges = edges.map((e, i) => ({
      id: i,
      from: e.from,
      to: e.to,
      label: e.label,
      title: e.title,
      value: e.value || 1,
      font: { color: 'var(--text-muted)', size: 8, strokeWidth: 0, align: 'middle', face: 'JetBrains Mono' }
    }))

    const net = new Network(
      graphRef.current,
      { nodes: visNodes, edges: visEdges },
      buildOptions()
    )

    net.on('click', params => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0]
        const node = nodes.find(n => n.id === nodeId)
        setSelectedNode(node || null)
      } else {
        setSelectedNode(null)
      }
    })

    netInst.current = net
    setNodeCount(nodes.length)
    setEdgeCount(edges.length)
  }, [theme, buildOptions])

  useEffect(() => {
    let active = true
    setTimeout(() => {
      if (active) {
        setGraphLoading(true)
        setSelectedNode(null)
        setTraceResult(null)
      }
    }, 0)

    const url = graphMode === 'fraud'
      ? `${API}/fraud-graph?limit=${limit}`
      : `${API}/cdr-graph?limit=${limit}`

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (!active) return
        renderGraph(data.nodes, data.edges, graphMode)
        setGraphLoading(false)
      })
      .catch(() => {
        if (active) setGraphLoading(false)
      })
    return () => { active = false }
  }, [graphMode, limit, renderGraph])

  function handleTrace() {
    if (!traceAccount.trim()) return
    setTimeout(() => setGraphLoading(true), 0)
    fetch(`${API}/fraud-chain/${encodeURIComponent(traceAccount.trim())}?hops=3`)
      .then(r => r.json())
      .then(data => {
        setTraceResult({ nodes: data.nodes.length, edges: data.edges.length })
        renderGraph(data.nodes, data.edges, 'fraud')
        setGraphLoading(false)
      })
      .catch(() => setGraphLoading(false))
  }

  const controls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', textTransform: 'uppercase' }}>Network View</span>
      <div className="seg">
        {[['fraud', 'Fraud Volume'], ['cdr', 'Telecom CDR']].map(([v, l]) => (
          <button
            key={v}
            className={`seg-btn ${graphMode === v ? 'active' : ''}`}
            onClick={() => setGraphMode(v)}
          >
            {l}
          </button>
        ))}
      </div>
      {graphLoading && <span style={{ fontSize: 10, color: 'var(--accent)' }}>⏳ Rendering…</span>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar
        title="Network Analysis — Connections"
        meta={`GRAPH · ${nodeCount} NODES · ${edgeCount} EDGES`}
        controls={controls}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* KPI Row */}
        {stats && (
          <div className="kpi-grid">
            <KPICard
              value={fmt(stats.total_fraud_amount)}
              label="Fraud Volume"
              sub="Sum of tagged transactions"
            />
            <KPICard
              value={fmt(stats.total_fraud_transactions)}
              label="Fraud Events"
              sub="Individual fraud FIR accounts"
            />
            <KPICard
              value={fmt(stats.high_risk_accounts)}
              label="High Risk Nodes"
              sub="Accounts above 0.8 threshold"
            />
            <KPICard
              value={fmt(stats.total_cdr_records)}
              label="Telecom CDRs"
              sub="Call detail data rows"
            />
          </div>
        )}

        <div className="content" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left panel options */}
          <div className="data-panel" style={{ width: 200, minWidth: 200 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div className="label-xs" style={{ marginBottom: 6 }}>Max Edge Limit</div>
              <select
                className="tb-select"
                style={{ width: '100%' }}
                value={limit}
                onChange={e => setLimit(Number(e.target.value))}
              >
                {[50, 100, 200, 500].map(v => <option key={v} value={v}>{v} links</option>)}
              </select>
            </div>

            {graphMode === 'fraud' && (
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <div className="label-xs" style={{ marginBottom: 6 }}>Trace Co-offender</div>
                <input
                  type="text"
                  className="tb-select"
                  style={{ width: '100%', padding: '6px 8px', textTransform: 'none' }}
                  placeholder="Enter Account ID..."
                  value={traceAccount}
                  onChange={e => setTraceAccount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTrace()}
                />
                <button
                  className="term-send"
                  style={{ width: '100%', marginTop: 6, justifyContent: 'center', fontSize: 10, padding: '5px' }}
                  onClick={handleTrace}
                >
                  Trace Path (3 Hops)
                </button>
                {traceResult && (
                  <div style={{ fontSize: 8.5, fontFamily: 'JetBrains Mono', color: 'var(--accent)', marginTop: 6 }}>
                    Traced: {traceResult.nodes} nodes / {traceResult.edges} links
                  </div>
                )}
              </div>
            )}

            {/* Legend section */}
            <div style={{ padding: '12px 14px', marginTop: 'auto', borderTop: '1px solid var(--border)' }}>
              <div className="label-xs" style={{ marginBottom: 8 }}>{graphMode === 'fraud' ? 'Risk Scale' : 'Carrier Legend'}</div>
              {graphMode === 'fraud' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[['var(--accent)', 'Critical (>= 0.8)'], ['var(--text-secondary)', 'Elevated (>= 0.6)'], ['var(--text-muted)', 'Moderate (>= 0.4)'], ['var(--text-ghost)', 'Nominal (< 0.2)']].map(([c, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, color: 'var(--text-secondary)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[['var(--accent)', 'Jio Network'], ['var(--text-secondary)', 'Airtel Network'], ['var(--text-muted)', 'Vi Network'], ['var(--text-dim)', 'BSNL Network']].map(([c, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, color: 'var(--text-secondary)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Canvas area */}
          <div style={{ flex: 1, position: 'relative', background: 'var(--map-bg)' }}>
            {graphLoading && (
              <div className="page-loader" style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'var(--accent-sub)' }}>
                <div className="loader-ring" />
              </div>
            )}
            <div ref={graphRef} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Node detail side panel */}
          <div className="ai-sidebar" style={{ width: 220, minWidth: 220 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div className="label-xs">Entity Properties</div>
            </div>
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selectedNode ? (
                graphMode === 'fraud' ? (
                  <>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{selectedNode.owner || 'Unnamed Account'}</div>
                      <div style={{ fontSize: 8.5, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>{selectedNode.id}</div>
                    </div>

                    <div style={{ padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div className="label-xs" style={{ fontSize: 8, marginBottom: 4 }}>Risk Level</div>
                      <div style={{ fontSize: 13, fontWeight: 500, fontFamily: 'JetBrains Mono', color: selectedNode.risk_score >= 0.8 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {(selectedNode.risk_score || 0).toFixed(4)}
                      </div>
                    </div>

                    <div style={{ padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div className="label-xs" style={{ fontSize: 8, marginBottom: 4 }}>Institution</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>{selectedNode.bank || 'Unknown Bank'}</div>
                    </div>

                    <div style={{ padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div className="label-xs" style={{ fontSize: 8, marginBottom: 4 }}>Connections (Degree)</div>
                      <div style={{ fontSize: 13, fontWeight: 500, fontFamily: 'JetBrains Mono', color: 'var(--text-primary)' }}>{selectedNode.val || 0}</div>
                    </div>

                    <button
                      className="term-send"
                      style={{ width: '100%', justifyContent: 'center', padding: '6px', fontSize: 10, marginTop: 4 }}
                      onClick={() => { setTraceAccount(selectedNode.id); setTimeout(handleTrace, 0) }}
                    >
                      Focus / Trace Node
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>Phone Contact</div>
                      <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>{selectedNode.id}</div>
                    </div>

                    <div style={{ padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div className="label-xs" style={{ fontSize: 8, marginBottom: 4 }}>Mobile Operator</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)' }}>{selectedNode.company || 'Unknown Network'}</div>
                    </div>

                    <div style={{ padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div className="label-xs" style={{ fontSize: 8, marginBottom: 4 }}>Connection Count</div>
                      <div style={{ fontSize: 13, fontWeight: 500, fontFamily: 'JetBrains Mono', color: 'var(--text-primary)' }}>{selectedNode.val || 0}</div>
                    </div>
                  </>
                )
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>
                  <i className="ti ti-vector-triangle" style={{ fontSize: 18, color: 'var(--text-ghost)', display: 'block', marginBottom: 8 }} />
                  Select node to view network properties
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
