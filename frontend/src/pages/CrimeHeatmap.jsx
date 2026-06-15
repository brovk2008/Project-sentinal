import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getApiBaseUrl } from '../config'

const API = `${getApiBaseUrl()}/api/v1/heatmap`

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

export default function CrimeHeatmap() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const layersRef = useRef({ heatmap: null, choropleth: null, stations: null })

  const [crimeGroups, setCrimeGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [viewMode, setViewMode] = useState('grid') // grid | choropleth | stations
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ points: 0, districts: 0, stations: 0 })
  const [hoverDistrict, setHoverDistrict] = useState(null)

  // Init map
  useEffect(() => {
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
    return () => { map.remove(); mapInstance.current = null }
  }, [])

  // Load crime groups
  useEffect(() => {
    fetch(`${API}/crime-groups`)
      .then(r => r.json())
      .then(data => setCrimeGroups(data))
      .catch(() => {})
  }, [])

  // Clear all overlays
  function clearLayers() {
    const map = mapInstance.current
    if (!map) return
    Object.values(layersRef.current).forEach(l => { if (l) map.removeLayer(l) })
    layersRef.current = { heatmap: null, choropleth: null, stations: null }
  }

  // Load data based on view mode
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    clearLayers()
    setLoading(true)

    if (viewMode === 'grid') {
      const params = new URLSearchParams()
      if (selectedGroup) params.set('crime_group', selectedGroup)
      if (selectedYear) params.set('year', selectedYear)

      fetch(`${API}/grid?${params}`)
        .then(r => r.json())
        .then(data => {
          setStats(s => ({ ...s, points: data.length }))
          const maxI = Math.max(...data.map(d => d.intensity), 1)

          const circles = data.map(d => {
            const ratio = d.intensity / maxI
            const color = ratio > 0.7 ? '#ef4444' : ratio > 0.4 ? '#f97316' : ratio > 0.15 ? '#fbbf24' : '#38bdf8'
            const radius = Math.max(800, ratio * 5000)
            return L.circle([d.lat, d.lng], {
              radius,
              fillColor: color,
              color: 'transparent',
              fillOpacity: Math.min(0.7, 0.2 + ratio * 0.5),
              weight: 0
            }).bindTooltip(`${d.intensity.toLocaleString()} FIRs`, { sticky: true })
          })
          const group = L.layerGroup(circles).addTo(map)
          layersRef.current.heatmap = group
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }

    if (viewMode === 'choropleth') {
      const params = new URLSearchParams()
      if (selectedGroup) params.set('crime_group', selectedGroup)
      if (selectedYear) params.set('year', selectedYear)

      fetch(`${API}/choropleth?${params}`)
        .then(r => r.json())
        .then(geojson => {
          const counts = geojson.features.map(f => f.properties.crime_count)
          const maxC = Math.max(...counts, 1)
          setStats(s => ({ ...s, districts: geojson.features.length }))

          const layer = L.geoJSON(geojson, {
            style: feature => {
              const ratio = feature.properties.crime_count / maxC
              const r = Math.round(8 + ratio * 230)
              const g = Math.round(30 - ratio * 30)
              const b = Math.round(40 - ratio * 30)
              return {
                fillColor: `rgb(${r},${g},${b})`,
                fillOpacity: 0.7,
                color: '#1e2d45',
                weight: 1.5
              }
            },
            onEachFeature: (feature, layer) => {
              const p = feature.properties
              layer.bindTooltip(
                `<b>${p.name}</b><br/>
                 FIRs: ${p.crime_count.toLocaleString()}<br/>
                 Violent: ${p.violent_count.toLocaleString()}<br/>
                 Financial: ${p.financial_count.toLocaleString()}`,
                { sticky: true }
              )
              layer.on('mouseover', () => setHoverDistrict(p))
              layer.on('mouseout', () => setHoverDistrict(null))
            }
          }).addTo(map)

          layersRef.current.choropleth = layer
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }

    if (viewMode === 'stations') {
      fetch(`${API}/stations?limit=100`)
        .then(r => r.json())
        .then(data => {
          setStats(s => ({ ...s, stations: data.length }))
          const markers = data.map(st => {
            const maxFirs = Math.max(...data.map(d => d.fir_count), 1)
            const ratio = st.fir_count / maxFirs
            const color = ratio > 0.6 ? '#ef4444' : ratio > 0.3 ? '#f97316' : '#38bdf8'
            const icon = L.divIcon({
              html: `<div style="width:${8 + ratio*16}px;height:${8 + ratio*16}px;
                background:${color};border-radius:50%;border:2px solid white;
                box-shadow:0 0 ${4 + ratio*8}px ${color};opacity:0.9;"></div>`,
              className: '',
              iconAnchor: [8, 8]
            })
            return L.marker([st.lat, st.lng], { icon })
              .bindTooltip(
                `<b>${st.name}</b><br/>${st.district}<br/>
                 FIRs: ${st.fir_count.toLocaleString()}<br/>
                 Top: ${st.top_crime || '—'}`,
                { sticky: true }
              )
          })
          const group = L.layerGroup(markers).addTo(map)
          layersRef.current.stations = group
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [viewMode, selectedGroup, selectedYear])

  const years = ['', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024']

  return (
    <>
      <div className="page-header">
        <h2>🗺️ Crime Heatmap — Karnataka<span className="badge">LIVE DATA · 1.67M FIRs</span></h2>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PostGIS · {stats.points > 0 ? fmt(stats.points) + ' grid cells' : stats.districts > 0 ? stats.districts + ' districts' : stats.stations > 0 ? stats.stations + ' stations' : '—'}</div>
      </div>

      <div className="filter-row">
        <span className="filter-label">View</span>
        <div className="toggle-group" style={{ width: 280 }}>
          {[['grid','🔥 Density Grid'],['choropleth','🗺 Choropleth'],['stations','📍 Stations']].map(([v,l]) => (
            <button key={v} id={`view-${v}`} className={`toggle-btn ${viewMode===v?'active':''}`} onClick={() => setViewMode(v)}>{l}</button>
          ))}
        </div>
        <span className="filter-label">Crime Group</span>
        <select id="filter-crime-group" className="filter-select" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
          <option value="">All Crimes</option>
          {crimeGroups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="filter-label">Year</span>
        <select id="filter-year" className="filter-select" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ minWidth: 90 }}>
          {years.map(y => <option key={y} value={y}>{y || 'All Years'}</option>)}
        </select>
        {loading && <span style={{ fontSize: 11, color: 'var(--accent-blue)' }}>⏳ Loading…</span>}
      </div>

      <div className="heatmap-layout">
        <div className="heatmap-sidebar">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Quick Stats</div>
          {[
            { label: 'Total FIRs', value: '1.67M', icon: '📋' },
            { label: 'Districts', value: '30', icon: '🏙️' },
            { label: 'Stations', value: '1,074', icon: '🏠' },
            { label: 'Crime Types', value: '626', icon: '📊' },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-blue)' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}

          {hoverDistrict && (
            <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--accent-blue)', marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', marginBottom: 8 }}>{hoverDistrict.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                <div>FIRs: <span className="mono" style={{ color: 'var(--text-primary)' }}>{hoverDistrict.crime_count?.toLocaleString()}</span></div>
                <div>Violent: <span className="mono" style={{ color: 'var(--accent-red)' }}>{hoverDistrict.violent_count?.toLocaleString()}</span></div>
                <div>Financial: <span className="mono" style={{ color: 'var(--accent-purple)' }}>{hoverDistrict.financial_count?.toLocaleString()}</span></div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Data source: Karnataka State Police FIR Records 2016–2024. PostGIS spatial indexing active.
            </div>
          </div>
        </div>

        <div className="heatmap-map-container">
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

          {viewMode === 'grid' && (
            <div className="map-legend">
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Crime Density</div>
              {[['#ef4444','Very High (1000+)'],['#f97316','High (500+)'],['#fbbf24','Medium (100+)'],['#38bdf8','Low (<100)']].map(([c,l]) => (
                <div key={c} className="map-legend-item">
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <span>{l}</span>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'choropleth' && (
            <div className="map-legend">
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>FIR Count</div>
              {[['rgb(238,30,30)','High'],['rgb(178,15,20)','Medium'],['rgb(80,10,15)','Low']].map(([c,l]) => (
                <div key={c} className="map-legend-item">
                  <div style={{ width: 16, height: 12, borderRadius: 3, background: c, flexShrink: 0 }} />
                  <span>{l}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
