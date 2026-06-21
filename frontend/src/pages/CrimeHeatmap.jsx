import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getApiBaseUrl } from '../config'
import Topbar from '../components/Topbar.jsx'

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
  const tileLayerRef = useRef(null)
  const layersRef = useRef({ heatmap: null, choropleth: null, stations: null })

  const [crimeGroups, setCrimeGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [viewMode, setViewMode] = useState('grid') // grid | choropleth | stations
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ points: 0, districts: 0, stations: 0 })
  const [hoverDistrict, setHoverDistrict] = useState(null)
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')

  useEffect(() => {
    const handleThemeChange = (e) => {
      setTheme(e.detail)
    }
    window.addEventListener('themechange', handleThemeChange)
    return () => window.removeEventListener('themechange', handleThemeChange)
  }, [])

  // Init map
  useEffect(() => {
    if (mapInstance.current) return
    const map = L.map(mapRef.current, {
      center: [14.5, 76.5],
      zoom: 7,
      zoomControl: true,
      attributionControl: false
    })

    mapInstance.current = map
    return () => { 
      map.remove()
      mapInstance.current = null 
    }
  }, [])

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
            const color = ratio > 0.7 ? '#c8814a' : ratio > 0.4 ? '#d59663' : ratio > 0.15 ? '#e2ab7d' : '#f0c197'
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
              // Visual styling matching the selected theme colors
              const opacityVal = 0.3 + ratio * 0.5
              return {
                fillColor: '#c8814a',
                fillOpacity: opacityVal,
                color: theme === 'dark' ? '#1c1c22' : '#d8d3cd',
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
            const color = ratio > 0.6 ? '#c8814a' : ratio > 0.3 ? '#d59663' : '#f0c197'
            const icon = L.divIcon({
              html: `<div style="width:${8 + ratio*16}px;height:${8 + ratio*16}px;
                background:${color};border-radius:50%;border:1.5px solid white;
                opacity:0.9;"></div>`,
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

  const metaText = `POSTGIS · ${stats.points > 0 ? fmt(stats.points) + ' grid cells' : stats.districts > 0 ? stats.districts + ' districts' : stats.stations > 0 ? stats.stations + ' stations' : '—'}`

  const controls = (
    <>
      <span className="filter-label">View</span>
      <div className="seg">
        {[['grid','Density Grid'],['choropleth','Choropleth'],['stations','Stations']].map(([v,l]) => (
          <button key={v} id={`view-${v}`} className={`seg-btn ${viewMode===v?'active':''}`} onClick={() => setViewMode(v)}>{l}</button>
        ))}
      </div>
      <span className="filter-label">Group</span>
      <select id="filter-crime-group" className="tb-select" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
        <option value="">All Crimes</option>
        {crimeGroups.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
      <span className="filter-label">Year</span>
      <select id="filter-year" className="tb-select" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ minWidth: 90 }}>
        {years.map(y => <option key={y} value={y}>{y || 'All Years'}</option>)}
      </select>
      {loading && <span style={{ fontSize: 10, color: 'var(--accent)' }}>⏳ Loading…</span>}
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <Topbar title="Crime Heatmap — Karnataka" meta={metaText} controls={controls} />

      <div className="content">
        <div className="data-panel">
          <div className="dp-section">Quick Stats</div>
          {[
            { label: 'Total FIRs', value: '1.67M', icon: 'ti-clipboard' },
            { label: 'Districts', value: '30', icon: 'ti-building' },
            { label: 'Stations', value: '1,074', icon: 'ti-home' },
            { label: 'Crime Types', value: '626', icon: 'ti-chart-bar' },
          ].map(s => (
            <div key={s.label} className="stat">
              <div className="stat-num">{s.value}</div>
              <div className="stat-label"><i className={`ti ${s.icon}`} style={{ marginRight: 4 }} />{s.label}</div>
            </div>
          ))}

          {hoverDistrict && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
              <div className="dc-name" style={{ color: 'var(--accent)', fontWeight: 500, fontSize: 11 }}>{hoverDistrict.name}</div>
              <div className="dc-val" style={{ fontSize: 9.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                <div>FIRs: <span className="mono" style={{ color: 'var(--text-primary)' }}>{hoverDistrict.crime_count?.toLocaleString()}</span></div>
                <div>Violent: <span className="mono" style={{ color: 'var(--accent)' }}>{hoverDistrict.violent_count?.toLocaleString()}</span></div>
                <div>Financial: <span className="mono" style={{ color: 'var(--text-primary)' }}>{hoverDistrict.financial_count?.toLocaleString()}</span></div>
              </div>
            </div>
          )}
        </div>

        <div className="map-wrap">
          <div ref={mapRef} className="map-container" />

          {viewMode === 'grid' && (
            <div className="map-legend">
              <div className="legend-txt" style={{ fontWeight: 500, marginBottom: 4 }}>Crime Density</div>
              {[['#c8814a','Very High (1000+)'],['#d59663','High (500+)'],['#e2ab7d','Medium (100+)'],['#f0c197','Low (<100)']].map(([c,l]) => (
                <div key={c} className="legend-row">
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
                  <span className="legend-txt">{l}</span>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'choropleth' && (
            <div className="map-legend">
              <div className="legend-txt" style={{ fontWeight: 500, marginBottom: 4 }}>FIR Count</div>
              {[['#c8814a','High'],['#d59663','Medium'],['#f0c197','Low']].map(([c,l]) => (
                <div key={c} className="legend-row">
                  <div style={{ width: 16, height: 12, borderRadius: 3, background: c }} />
                  <span className="legend-txt">{l}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
