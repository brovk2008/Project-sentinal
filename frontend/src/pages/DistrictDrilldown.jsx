import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getApiBaseUrl } from '../config'
import Topbar from '../components/Topbar.jsx'
import KPICard from '../components/KPICard.jsx'

const API_D = `${getApiBaseUrl()}/api/v1/districts`

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 3, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>{label?.slice(0, 7)}</div>
      <div style={{ color: 'var(--accent)', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        <span>FIRs:</span>
        <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 500 }}>{fmt(payload[0]?.value)}</span>
      </div>
    </div>
  )
}

export default function DistrictDrilldown() {
  const [districts, setDistricts] = useState([])
  const [selected, setSelected] = useState(null)
  const [profile, setProfile] = useState(null)
  const [stations, setStations] = useState([])
  const [trend, setTrend] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('total_firs')
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')

  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const tileLayerRef = useRef(null)
  const stLayerRef = useRef(null)

  useEffect(() => {
    const handleThemeChange = (e) => {
      setTheme(e.detail)
    }
    window.addEventListener('themechange', handleThemeChange)
    return () => window.removeEventListener('themechange', handleThemeChange)
  }, [])

  useEffect(() => {
    fetch(API_D + '/')
      .then(r => r.json())
      .then(data => {
        setDistricts(data)
        setLoading(false)
        if (data.length > 0) selectDistrict(data[0].name)
      })
      .catch(() => setLoading(false))
  }, [])

  // Helper to update markers
  function updateMarkers(map, sts) {
    if (!map) return
    if (stLayerRef.current) {
      map.removeLayer(stLayerRef.current)
      stLayerRef.current = null
    }
    if (!sts || sts.length === 0) return

    const markers = sts.filter(s => s.lat && s.lng).map(s => {
      const maxFirs = Math.max(...sts.map(x => x.fir_count), 1)
      const ratio = s.fir_count / maxFirs
      const color = ratio > 0.6 ? 'var(--accent)' : 'var(--text-secondary)'
      const size = 8 + ratio * 10
      const icon = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:1px solid var(--bg-panel);opacity:0.9;"></div>`,
        className: '',
        iconAnchor: [Math.round(size / 2), Math.round(size / 2)]
      })
      return L.marker([s.lat, s.lng], { icon }).bindTooltip(`<b>${s.name}</b><br/>FIRs: ${s.fir_count.toLocaleString()}`)
    })

    if (markers.length > 0) {
      const g = L.layerGroup(markers).addTo(map)
      stLayerRef.current = g
      const bounds = markers.map(m => m.getLatLng())
      map.fitBounds(bounds, { padding: [15, 15], maxZoom: 10 })
    }
  }

  // Init mini-map when profile changes and mapRef.current becomes available
  useEffect(() => {
    if (!profile) return
    if (mapInst.current) return // Already initialized

    if (mapRef.current) {
      const map = L.map(mapRef.current, {
        center: [14.5, 76.5],
        zoom: 7,
        zoomControl: false,
        attributionControl: false
      })
      mapInst.current = map
    }
  }, [profile])

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInst.current) {
        mapInst.current.remove()
        mapInst.current = null
        tileLayerRef.current = null
        stLayerRef.current = null
      }
    }
  }, [])

  // Update tile layer based on theme and mapInst availability
  useEffect(() => {
    const map = mapInst.current
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
  }, [theme, profile]) // run on theme change or when profile changes (which mounts map)

  // Sync markers when stations or map changes
  useEffect(() => {
    const map = mapInst.current
    if (!map) return
    updateMarkers(map, stations)
  }, [stations, profile])

  function selectDistrict(name) {
    setSelected(name)

    Promise.all([
      fetch(`${API_D}/${encodeURIComponent(name)}`).then(r => r.json()),
      fetch(`${API_D}/${encodeURIComponent(name)}/stations`).then(r => r.json()),
      fetch(`${API_D}/${encodeURIComponent(name)}/trend`).then(r => r.json()),
    ]).then(([prof, sts, tr]) => {
      setProfile(prof)
      setStations(sts)
      setTrend(tr)
    }).catch(console.error)
  }

  const filteredDistricts = districts
    .filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0))

  const maxTotalFirs = Math.max(...districts.map(d => d.total_firs), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar
        title="District Intelligence — Karnataka"
        meta={`GEOGRAPHY · ${districts.length} DISTRICTS`}
        controls={
          loading && <span style={{ fontSize: 10, color: 'var(--accent)' }}>⏳ Loading…</span>
        }
      />

      <div className="content">
        {/* District list sidebar */}
        <div className="data-panel" style={{ width: 200, minWidth: 200 }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              className="tb-select"
              style={{ width: '100%', padding: '6px 8px', textTransform: 'none', fontFamily: 'Inter' }}
              placeholder="Search district..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="label-xs" style={{ flexShrink: 0, fontSize: 8 }}>Sort By</span>
            <select
              className="tb-select"
              style={{ flex: 1, padding: '4px 6px' }}
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="total_firs">FIR Count</option>
              <option value="arrest_rate">Arrest Rate</option>
              <option value="crime_rate_per_100k">Crime / 100K</option>
              <option value="total_victims">Victims</option>
            </select>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredDistricts.map((d, i) => {
              const ratio = d.total_firs / maxTotalFirs
              const isSelected = selected === d.name
              return (
                <div
                  key={d.name}
                  className={`dp-row ${isSelected ? 'active' : ''}`}
                  onClick={() => selectDistrict(d.name)}
                  style={{ cursor: 'pointer', background: isSelected ? 'var(--accent-sub)' : '' }}
                >
                  <div className="dp-row-top">
                    <span className={`dp-row-name ${isSelected ? 'highlight' : ''}`} style={{ fontSize: 10, display: 'flex', gap: 4 }}>
                      <span className="mono" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>#{d.crime_rank}</span>
                      {d.name}
                    </span>
                    <span className={`dp-row-val ${isSelected ? 'highlight' : ''}`} style={{ fontSize: 9 }}>{fmt(d.total_firs)}</span>
                  </div>
                  <div className="dp-bar-bg" style={{ height: 1, background: 'var(--border)', marginTop: 4 }}>
                    <div
                      className={`dp-bar-fg ${isSelected ? 'highlight' : ''}`}
                      style={{ width: `${ratio * 100}%`, height: 1, background: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Profile dashboard */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--bg-base)' }}>
          {profile ? (
            <>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 300, color: 'var(--text-primary)', letterSpacing: '-.02em', textTransform: 'uppercase' }}>{profile.name} Profile</h2>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                  RANGE: {profile.earliest_fir?.slice(0, 10)} TO {profile.latest_fir?.slice(0, 10)} · {profile.station_count} STATIONS · {profile.unique_crime_types} CRIME HEADS
                </div>
              </div>

              {/* KPIs */}
              <div className="kpi-grid">
                <KPICard value={fmt(profile.total_firs)} label="Total FIRs" sub="Recorded case files" />
                <KPICard value={`${profile.arrest_rate?.toFixed(1)}%`} label="Arrest Rate" sub="Apprehended ratio" />
                <KPICard
                  value={profile.population ? fmt(profile.population) : '—'}
                  label="Population"
                  sub="Census demographic metric"
                />
                <KPICard
                  value={profile.crime_rate_per_100k ? profile.crime_rate_per_100k.toFixed(0) : '—'}
                  label="Rate / 100K"
                  sub="Crime per capita density"
                />
              </div>

              {/* Map & Trend Chart Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Station Map */}
                <div style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', height: 230, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono', color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Station Geo Map</span>
                    <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>{stations.length} STATIONS</span>
                  </div>
                  <div ref={mapRef} style={{ flex: 1, width: '100%', background: 'var(--map-bg)' }} />
                </div>

                {/* Trend Chart */}
                <div style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)', height: 230, display: 'flex', flexDirection: 'column', padding: '10px 14px' }}>
                  <div style={{ marginBottom: 12, paddingLeft: 6 }}>
                    <span style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono', color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Monthly Case Trend</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                        <defs>
                          <linearGradient id="dGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="period" tickLine={false} axisLine={false} tickFormatter={v => v?.slice(2, 7)} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={fmt} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="count" stroke="var(--accent)" fill="url(#dGrad)" strokeWidth={1.5} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Station Listing Table */}
              <div style={{ border: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 9.5, fontFamily: 'JetBrains Mono', color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Top Performing / Active Stations</span>
                  <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>ORDERED BY FIR COUNT</span>
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>Rank</th>
                        <th>Station Name</th>
                        <th>FIRs</th>
                        <th>Accused</th>
                        <th>Arrested</th>
                        <th>Arrest %</th>
                        <th>Conviction %</th>
                        <th>Primary Offense</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stations.map((s, i) => (
                        <tr key={s.name}>
                          <td className="mono" style={{ fontSize: 9.5, color: i === 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                            #{i + 1}
                          </td>
                          <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}</td>
                          <td className="mono" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{fmt(s.fir_count)}</td>
                          <td className="mono">{fmt(s.accused)}</td>
                          <td className="mono">{fmt(s.arrested)}</td>
                          <td className="mono" style={{ color: s.arrest_rate > 60 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {s.arrest_rate?.toFixed(1)}%
                          </td>
                          <td className="mono">
                            {s.conviction_rate?.toFixed(1)}%
                          </td>
                          <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>{s.top_crime || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div className="empty-state">
                <i className="ti ti-building empty-icon" />
                <span className="empty-msg">Select a district from the left panel to begin drilldown analysis</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
