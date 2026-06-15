import { useState, useEffect, useRef, useCallback } from 'react'
import { Network } from 'vis-network/standalone'
import { getApiBaseUrl } from '../config'

const API = `${getApiBaseUrl()}/api/v1/network`

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return '₹' + (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000) return '₹' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

// Risk score → color gradient green→yellow→red
function riskColor(score) {
  if (score >= 0.8) return '#ef4444'
  if (score >= 0.6) return '#f97316'
  if (score >= 0.4) return '#fbbf24'
  if (score >= 0.2) return '#34d399'
  return '#38bdf8'
}

// Telecom company color palette
const COMPANY_COLORS = {
  'Jio': '#38bdf8', 'Airtel': '#f87171', 'Vi': '#a78bfa',
  'BSNL': '#34d399', 'default': '#94a3b8'
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

  // Load KPI stats
  useEffect(() => {
    fetch(`${API}/stats`)
      .then(r => r.json())
      .then(data => { setStats(data) })
      .catch(() => {})
  }, [])

  // Build vis-network options
  const buildOptions = () => ({
    nodes: {
      shape: 'dot',
      scaling: { min: 8, max: 28 },
      font: { color: '#94a3b8', size: 10, face: 'Inter' },
      borderWidth: 2,
      borderWidthSelected: 3,
      shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', size: 8 }
    },
    edges: {
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      color: { color: '#1e3a5f', highlight: '#38bdf8', hover: '#38bdf8' },
      smooth: { type: 'dynamic' },
      scaling: { min: 1, max: 5 },
      shadow: false
    },
    physics: {
      stabilization: { iterations: 150 },
      barnesHut: { gravitationalConstant: -8000, springLength: 120 }
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      hideEdgesOnDrag: true,
      navigationButtons: false,
      keyboard: false
    },
    layout: { randomSeed: 42 }
  })

  const renderGraph = useCallback((nodes, edges, mode) => {
    if (!graphRef.current) return
    if (netInst.current) { netInst.current.destroy() }

    const visNodes = nodes.map(n => ({
      id: n.id,
      label: mode === 'fraud'
        ? (n.owner && n.owner !== 'Unknown' ? n.owner.split(' ')[0] : n.id.slice(-6))
        : n.id.slice(-8),
      title: mode === 'fraud'
        ? `<div style="background:#0d1422;border:1px solid #1e2d45;border-radius:8px;padding:10px;color:#94a3b8;font-size:12px;">
            <b style="color:#f0f6ff">${n.owner || n.id}</b><br/>
            Bank: ${n.bank || '—'}<br/>
            Risk: <span style="color:${riskColor(n.risk_score)}">${(n.risk_score || 0).toFixed(2)}</span>
           </div>`
        : `<div style="background:#0d1422;border:1px solid #1e2d45;border-radius:8px;padding:8px;color:#94a3b8;font-size:12px;">
            <b style="color:#f0f6ff">${n.id}</b><br/>Company: ${n.company || '—'}
           </div>`,
      size: 6 + Math.min((n.val || 1) * 4, 22),
      color: {
        background: mode === 'fraud' ? riskColor(n.risk_score || 0) : (COMPANY_COLORS[n.company] || COMPANY_COLORS.default),
        border: mode === 'fraud' ? riskColor(n.risk_score || 0) : (COMPANY_COLORS[n.company] || COMPANY_COLORS.default),
        highlight: { background: '#ffffff', border: '#38bdf8' }
      },
      font: { color: '#e2e8f0' }
    }))

    const visEdges = edges.map((e, i) => ({
      id: i,
      from: e.from,
      to: e.to,
      label: e.label,
      title: e.title,
      value: e.value || 1,
      color: e.color || undefined,
      font: { color: '#475569', size: 9, strokeWidth: 0, align: 'middle' }
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
  }, [])

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

  return (
    <>
      <div className="page-header">
        <h2>🕸️ Network Analysis — Fraud & Communication<span className="badge">REAL DATA</span></h2>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>vis-network · Max 300 nodes / 1000 edges</div>
      </div>

      {/* Stats KPIs */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, padding: '16px 24px 0', flexWrap: 'wrap' }}>
          {[
            { icon: '💰', value: fmt(stats.total_fraud_amount), label: 'Total Fraud Volume', color: 'var(--accent-red)' },
            { icon: '🚨', value: fmt(stats.total_fraud_transactions), label: 'Fraud Transactions', color: 'var(--accent-amber)' },
            { icon: '⚠️', value: fmt(stats.high_risk_accounts), label: 'High-Risk Accounts', color: 'var(--accent-purple)' },
            { icon: '📞', value: fmt(stats.total_cdr_records), label: 'CDR Records', color: 'var(--accent-cyan)' },
            { icon: '📱', value: fmt(stats.unique_callers), label: 'Unique Numbers', color: 'var(--accent-blue)' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, minWidth: 150, padding: '12px 14px', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'JetBrains Mono', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="network-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', marginTop: 16 }}>
        {/* Controls Panel */}
        <div className="network-controls">
          <div className="control-group">
            <div className="control-group-label">Graph Mode</div>
            {[['fraud','💰 Fraud Network'],['cdr','📞 CDR Call Network']].map(([v,l]) => (
              <label key={v} className="radio-item">
                <input type="radio" name="graphMode" value={v} checked={graphMode===v} onChange={() => setGraphMode(v)} />
                {l}
              </label>
            ))}
          </div>

          <div className="control-group">
            <div className="control-group-label">Max Edges</div>
            <select id="limit-select" className="filter-select" value={limit} onChange={e => setLimit(Number(e.target.value))}>
              {[50, 100, 200, 500].map(v => <option key={v} value={v}>{v} edges</option>)}
            </select>
          </div>

          {graphMode === 'fraud' && (
            <div className="control-group">
              <div className="control-group-label">Trace Fraud Chain</div>
              <input id="trace-account-input" className="filter-input" style={{ minWidth: 0 }}
                placeholder="Account ID…"
                value={traceAccount}
                onChange={e => setTraceAccount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTrace()}
              />
              <button id="trace-btn" className="filter-btn" style={{ marginTop: 4 }} onClick={handleTrace}>
                🔍 Trace (3 hops)
              </button>
              {traceResult && (
                <div style={{ fontSize: 11, color: 'var(--accent-green)', marginTop: 4 }}>
                  Traced: {traceResult.nodes} nodes · {traceResult.edges} edges
                </div>
              )}
            </div>
          )}

          <div className="control-group">
            <div className="control-group-label">Graph Info</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              <div>Nodes: <span className="mono" style={{ color: 'var(--accent-blue)' }}>{nodeCount}</span></div>
              <div>Edges: <span className="mono" style={{ color: 'var(--accent-blue)' }}>{edgeCount}</span></div>
            </div>
          </div>

          {graphMode === 'fraud' && (
            <div className="control-group">
              <div className="control-group-label">Risk Legend</div>
              {[['#ef4444','High (>0.8)'],['#f97316','Med-High (0.6)'],['#fbbf24','Medium (0.4)'],['#34d399','Low (0.2)'],['#38bdf8','Minimal']].map(([c,l]) => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-secondary)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />{l}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Graph Canvas */}
        <div className="network-graph">
          {graphLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: 'rgba(8,12,20,0.6)' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Building graph…</div>
              </div>
            </div>
          )}
          <div ref={graphRef} className="graph-canvas" />
        </div>

        {/* Node Detail Panel */}
        <div className="network-details">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 12 }}>
            Node Details
          </div>
          {!selectedNode && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Click any node in the graph to see its details here.
            </div>
          )}
          {selectedNode && graphMode === 'fraud' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{selectedNode.owner || selectedNode.id}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>{selectedNode.id}</div>
              </div>
              {[
                { label: 'Bank', value: selectedNode.bank || '—' },
                { label: 'Risk Score', value: (selectedNode.risk_score || 0).toFixed(2), color: riskColor(selectedNode.risk_score || 0) },
                { label: 'Network Degree', value: selectedNode.val },
              ].map(item => (
                <div key={item.label} style={{ padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono', color: item.color || 'var(--text-primary)' }}>{item.value}</div>
                </div>
              ))}
              <div style={{ marginTop: 4 }}>
                <div style={{ marginBottom: 6, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Risk Bar</div>
                <div className="risk-bar-wrap">
                  <div className="risk-bar-fill" style={{
                    width: `${(selectedNode.risk_score || 0) * 100}%`,
                    background: riskColor(selectedNode.risk_score || 0)
                  }} />
                </div>
              </div>
              <button
                id="trace-selected-btn"
                className="filter-btn"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => { setTraceAccount(selectedNode.id); setTimeout(handleTrace, 0) }}
              >
                🔍 Trace This Account
              </button>
            </div>
          )}
          {selectedNode && graphMode === 'cdr' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{selectedNode.id}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Telecom: {selectedNode.company || '—'}</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Network Connections</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'JetBrains Mono', color: 'var(--accent-blue)' }}>{selectedNode.val}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
