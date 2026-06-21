import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getApiBaseUrl } from '../config'
import Topbar from '../components/Topbar.jsx'
import KPICard from '../components/KPICard.jsx'

const API = `${getApiBaseUrl()}/api/v1/ai`

function XAIPanel({ item }) {
  if (!item) return (
    <div className="ai-sidebar" style={{ width: 220, minWidth: 220 }}>
      <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', marginTop: 40 }}>
        <i className="ti ti-hexagons" style={{ fontSize: 18, color: 'var(--text-ghost)', display: 'block', marginBottom: 8 }} />
        Select a police station to view AI explanation
      </div>
    </div>
  )

  const maxImp = Math.max(...(item.feature_importance || []).map(f => f?.importance || 0), 0.001)

  return (
    <div className="ai-sidebar" style={{ width: 220, minWidth: 220 }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div className="label-xs" style={{ fontSize: 8 }}>Explainable AI</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginTop: 4, textTransform: 'uppercase' }}>
          {item.unit_name || 'UNKNOWN'}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
          {(item.district_name || 'UNKNOWN').toUpperCase()} DISTRICT
        </div>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Key metrics */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Prediction Metrics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Hotspot Prob.', value: `${((item.probability || 0) * 100).toFixed(1)}%` },
              { label: 'Risk Index', value: item.risk_level || 'UNKNOWN', color: item.risk_level === 'CRITICAL' ? 'var(--accent)' : 'var(--text-secondary)' },
              { label: 'Model Conf.',    value: `${Math.round((item.confidence || 0) * 100)}%` },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 10, color: m.color || 'var(--text-primary)', fontWeight: 500 }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Probability bar */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Hotspot Score</div>
          <div style={{ height: 2, background: 'var(--border)', position: 'relative' }}>
            <div
              style={{
                height: 2,
                width: `${(item.probability || 0) * 100}%`,
                background: item.risk_level === 'CRITICAL' ? 'var(--accent)' : 'var(--text-muted)'
              }}
            />
          </div>
        </div>

        {/* Feature importance */}
        {(item.feature_importance || []).length > 0 && (
          <div>
            <div className="label-xs" style={{ fontSize: 8, marginBottom: 8 }}>Feature Weights</div>
            {(item.feature_importance || []).map(f => (
              <div key={f?.feature || 'unknown'} className="xai-feature-row">
                <div className="xai-feature-name" style={{ fontSize: 8.5 }}>{f?.feature || 'Unknown'}</div>
                <div className="xai-feature-bar-wrap">
                  <div className="xai-feature-bar" style={{ width: `${((f?.importance || 0) / maxImp) * 100}%` }} />
                </div>
                <div className="xai-feature-pct" style={{ fontSize: 8.5 }}>{Math.round((f?.importance || 0) * 100)}%</div>
              </div>
            ))}
          </div>
        )}

        {/* Explanation */}
        <div>
          <div className="label-xs" style={{ fontSize: 8, marginBottom: 6 }}>Model Rationale</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')

  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const tileLayerRef = useRef(null)
  const layersRef = useRef(null)

  useEffect(() => {
    const handleThemeChange = (e) => {
      setTheme(e.detail)
    }
    window.addEventListener('themechange', handleThemeChange)
    return () => window.removeEventListener('themechange', handleThemeChange)
  }, [])

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
      zoomControl: false,
      attributionControl: false
    })

    mapInstance.current = map

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [loading, error])

  // Update tile layer based on theme
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
    }
    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

    tileLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom: 18,
      attribution: '© CartoDB'
    }).addTo(map)
  }, [theme])

  // Update map markers when data changes
  useEffect(() => {
    if (!mapInstance.current || (data || []).length === 0) return

    // Clear existing layer group if any
    if (layersRef.current) {
      mapInstance.current.removeLayer(layersRef.current)
      layersRef.current = null
    }

    const markers = [];

    (data || []).forEach(h => {
      if (!h) return
      const color = h.risk_level === 'CRITICAL' ? 'var(--accent)' : 'var(--text-muted)'
      const radius = 2000 + (h.probability || 0) * 5000 // meters

      const circle = L.circle([h.latitude || 14.5, h.longitude || 76.5], {
        color: color,
        fillColor: color,
        fillOpacity: 0.2,
        weight: 1,
        radius: radius
      })

      circle.bindTooltip(`
        <div style="font-family: Inter, sans-serif; padding: 4px; font-size: 11px;">
          <div style="font-weight: 700; color: var(--accent);">${h.unit_name || 'UNKNOWN'}</div>
          <div style="color: var(--text-secondary); margin-top: 2px;">District: ${h.district_name || 'UNKNOWN'}</div>
          <div style="color: var(--text-primary); font-weight: 600; margin-top: 4px;">Risk: ${h.risk_level || 'UNKNOWN'} (${Math.round((h.probability || 0) * 100)}%)</div>
        </div>
      `, { direction: 'top', opacity: 0.9 })

      circle.on('click', () => {
        setSelected(h)
      })

      markers.push(circle)
    })

    if (markers.length > 0) {
      layersRef.current = L.layerGroup(markers).addTo(mapInstance.current)
    }
  }, [data])

  // Center map on selected hotspot
  useEffect(() => {
    if (!mapInstance.current || !selected) return
    mapInstance.current.setView([selected.latitude || 14.5, selected.longitude || 76.5], 11, { animate: true })
  }, [selected])

  if (loading) return (
    <div className="page-loader">
      <div className="loader-ring" />
    </div>
  )
  if (error) return (
    <div className="empty-state">
      <i className="ti ti-alert-triangle empty-icon" style={{ color: 'var(--accent)' }} />
      <span className="empty-msg">Error loading emerging hotspots: {error}</span>
    </div>
  )

  const filteredData = (data || []).filter(h =>
    h && ((h.unit_name || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
    (h.district_name || '').toLowerCase().includes((searchQuery || '').toLowerCase()))
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar
        title="Emerging Hotspots — Karnataka"
        meta={`HOTSPOTS · ${(data || []).length} CRITICAL SECTORS`}
        controls={null}
      />

      <div className="ai-layout" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'auto', overflow: 'hidden' }}>
        {/* KPI Row */}
        <div className="kpi-grid">
          <KPICard
            value={(data || []).length}
            label="Total Stations Analysed"
            sub="Emerging threat classification feed"
          />
          <KPICard
            value={(data || []).filter(h => h && h.risk_level === 'CRITICAL').length}
            label="Critical Risk Zones"
            sub="Probability index > 80%"
          />
          <KPICard
            value={(data || []).filter(h => h && h.risk_level === 'HIGH').length}
            label="High Risk Sectors"
            sub="Probability index 50% - 80%"
          />
          <KPICard
            value="XGBoost Classifier"
            label="Model Framework"
            sub="F1-Score: 0.1715 (baseline 0.11)"
          />
        </div>

        <div className="ai-split" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Map canvas */}
          <div style={{ flex: 1.2, position: 'relative', height: '100%', background: 'var(--map-bg)' }}>
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* List Feed */}
          <div className="ai-main" style={{ borderLeft: '1px solid var(--border)', flex: 0.8, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div className="label-xs" style={{ marginBottom: 6 }}>Hotspot Feed Search</div>
              <input
                type="text"
                placeholder="Search station or district..."
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
                    <th>Station Name</th>
                    <th>District</th>
                    <th>Score</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredData || []).map(h => {
                    if (!h) return null
                    const isSelected = selected?.unit_id === h.unit_id
                    const badgeClass = h.risk_level === 'CRITICAL' ? 'badge-critical' : h.risk_level === 'HIGH' ? 'badge-warning' : 'badge-neutral'
                    return (
                      <tr
                        key={h.unit_id}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelected(h)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{h.unit_name || 'UNKNOWN'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{h.district_name || 'UNKNOWN'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ height: 2, background: 'var(--border)', width: 35, position: 'relative' }}>
                              <div
                                style={{
                                  height: 2,
                                  background: h.risk_level === 'CRITICAL' ? 'var(--accent)' : 'var(--text-muted)',
                                  width: `${(h.probability || 0) * 100}%`
                                }}
                              />
                            </div>
                            <span className="mono" style={{ fontSize: 9 }}>{Math.round((h.probability || 0) * 100)}%</span>
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

          {/* XAI Details */}
          <XAIPanel item={selected} />
        </div>
      </div>
    </div>
  )
}
