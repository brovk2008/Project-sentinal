import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getApiBaseUrl } from '../config'

const API = `${getApiBaseUrl()}/api/v1/ai`

function XAIPanel({ item }) {
  if (!item) return (
    <div className="ai-sidebar">
      <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 11 }}>
        Select a police station to view AI explanation
      </div>
    </div>
  )

  const maxImp = Math.max(...(item.feature_importance || []).map(f => f?.importance || 0), 0.001)

  return (
    <div className="ai-sidebar">
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div className="label-xs">XAI Analysis</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
          {item.unit_name || 'UNKNOWN'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {(item.district_name || 'UNKNOWN')} District
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Key metrics */}
        <div>
          <div className="label-xs" style={{ marginBottom: 8 }}>Prediction Metrics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Hotspot Probability', value: `${((item.probability || 0) * 100).toFixed(1)}%` },
              { label: 'Risk Classification', value: item.risk_level || 'UNKNOWN', color: `var(--${(item.risk_level || 'UNKNOWN').toLowerCase() === 'critical' ? 'critical' : (item.risk_level || 'UNKNOWN').toLowerCase() === 'high' ? 'warning' : 'text-secondary'})` },
              { label: 'Model Confidence',    value: `${Math.round((item.confidence || 0) * 100)}%` },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 11, color: m.color || 'var(--text-primary)', fontWeight: 600 }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Probability bar */}
        <div>
          <div className="label-xs" style={{ marginBottom: 6 }}>Hotspot Score</div>
          <div className="risk-bar-wrap">
            <div
              className={`risk-bar-fill ${item.risk_level === 'CRITICAL' ? 'critical' : item.risk_level === 'HIGH' ? 'warning' : 'success'}`}
              style={{ width: `${(item.probability || 0) * 100}%` }}
            />
          </div>
        </div>

        {/* Feature importance */}
        {(item.feature_importance || []).length > 0 && (
          <div>
            <div className="label-xs" style={{ marginBottom: 8 }}>Feature Importance</div>
            {(item.feature_importance || []).map(f => (
              <div key={f?.feature || 'unknown'} className="xai-feature-row">
                <div className="xai-feature-name">{f?.feature || 'Unknown'}</div>
                <div className="xai-feature-bar-wrap">
                  <div className="xai-feature-bar" style={{ width: `${((f?.importance || 0) / maxImp) * 100}%` }} />
                </div>
                <div className="xai-feature-pct">{Math.round((f?.importance || 0) * 100)}%</div>
              </div>
            ))}
          </div>
        )}

        {/* Explanation */}
        <div>
          <div className="label-xs" style={{ marginBottom: 6 }}>AI Explanation</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {item.explanation || 'No explanation available.'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AIHotspots() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const layersRef = useRef(null)

  // Fetch hotspots
  useEffect(() => {
    fetch(`${API}/hotspots/emerging`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        const list = d || []
        setData(list)
        setLoading(false)
        if (list.length > 0) {
          setSelected(list[0])
        }
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [])

  // Init Leaflet map
  useEffect(() => {
    if (loading || error || !mapRef.current) return
    if (mapInstance.current) return

    const map = L.map(mapRef.current, {
      center: [14.5, 76.5],
      zoom: 7,
      zoomControl: true,
      attributionControl: false
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18
    }).addTo(map)

    mapInstance.current = map
    layersRef.current = L.layerGroup().addTo(map)

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [loading, error])

  // Update map markers when data changes
  useEffect(() => {
    if (!mapInstance.current || !layersRef.current || (data || []).length === 0) return

    layersRef.current.clearLayers()

    (data || []).forEach(h => {
      if (!h) return
      const color = h.risk_level === 'CRITICAL' ? 'var(--critical)' : h.risk_level === 'HIGH' ? 'var(--warning)' : 'var(--success)'
      const radius = 2000 + (h.probability || 0) * 5000 // meters

      const circle = L.circle([h.latitude || 14.5, h.longitude || 76.5], {
        color: color,
        fillColor: color,
        fillOpacity: 0.3,
        weight: 1.5,
        radius: radius
      })

      circle.bindTooltip(`
        <div style="font-family: Inter, sans-serif; padding: 4px; font-size: 11px;">
          <div style="font-weight: 700; color: #fff;">${h.unit_name || 'UNKNOWN'}</div>
          <div style="color: #9CA3AF; margin-top: 2px;">District: ${h.district_name || 'UNKNOWN'}</div>
          <div style="color: ${color}; font-weight: 600; margin-top: 4px;">Risk: ${h.risk_level || 'UNKNOWN'} (${Math.round((h.probability || 0) * 100)}%)</div>
        </div>
      `, { direction: 'top', opacity: 0.9 })

      circle.on('click', () => {
        setSelected(h)
      })

      layersRef.current.addLayer(circle)
    })
  }, [data])

  // Center map on selected hotspot
  useEffect(() => {
    if (!mapInstance.current || !selected) return
    mapInstance.current.setView([selected.latitude || 14.5, selected.longitude || 76.5], 11, { animate: true })
  }, [selected])

  if (loading) return (
    <div className="loading-container">
      <div className="spinner" />
      <span style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Loading emerging hotspot model…</span>
    </div>
  )
  if (error) return <div className="error-banner">ERROR: {error}</div>

  const filteredData = (data || []).filter(h =>
    h && ((h.unit_name || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
    (h.district_name || '').toLowerCase().includes((searchQuery || '').toLowerCase()))
  )

  return (
    <div className="ai-layout">
      {/* KPI Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Top Emerging Hotspots</div>
          <div className="kpi-value">{(data || []).length}</div>
          <div className="kpi-sub">Police stations analysed</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Critical Risk Zones</div>
          <div className="kpi-value" style={{ color: 'var(--critical)' }}>
            {(data || []).filter(h => h && h.risk_level === 'CRITICAL').length}
          </div>
          <div className="kpi-sub">Probability &gt; 80%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">High Risk Zones</div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>
            {(data || []).filter(h => h && h.risk_level === 'HIGH').length}
          </div>
          <div className="kpi-sub">Probability 50% - 80%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Hotspot Classifier</div>
          <div className="kpi-value" style={{ fontSize: 14, letterSpacing: 0 }}>XGBoost</div>
          <div className="kpi-sub mono">F1-score 0.176 · 41.2s train</div>
        </div>
      </div>

      <div className="ai-split">
        {/* Map Panel */}
        <div style={{ flex: 1.2, position: 'relative', height: '100%' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%', background: 'var(--bg-primary)' }} />
        </div>

        {/* Hotspots List Panel */}
        <div className="ai-main" style={{ borderLeft: '1px solid var(--border)', flex: 0.8 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="label-xs">Risk Classification Feed</div>
            <input
              type="text"
              placeholder="Search station or district..."
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
                  <th>Station</th>
                  <th>District</th>
                  <th>Risk Score</th>
                  <th>Level</th>
                </tr>
              </thead>
              <tbody>
                {(filteredData || []).map(h => {
                  if (!h) return null
                  const badgeClass = h.risk_level === 'CRITICAL' ? 'badge-critical' : h.risk_level === 'HIGH' ? 'badge-warning' : 'badge-neutral'
                  return (
                    <tr
                      key={h.unit_id}
                      className={selected?.unit_id === h.unit_id ? 'selected' : ''}
                      onClick={() => setSelected(h)}
                    >
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.unit_name || 'UNKNOWN'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{h.district_name || 'UNKNOWN'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="risk-bar-wrap" style={{ width: 40 }}>
                            <div
                              className={`risk-bar-fill ${h.risk_level === 'CRITICAL' ? 'critical' : h.risk_level === 'HIGH' ? 'warning' : 'success'}`}
                              style={{ width: `${(h.probability || 0) * 100}%` }}
                            />
                          </div>
                          <span className="mono" style={{ fontSize: 10 }}>{Math.round((h.probability || 0) * 100)}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${badgeClass}`} style={{ fontSize: 8 }}>
                          {h.risk_level || 'UNKNOWN'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* XAI Panel */}
        <XAIPanel item={selected} />
      </div>
    </div>
  )
}
