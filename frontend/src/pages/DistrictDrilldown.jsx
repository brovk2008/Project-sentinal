import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getApiBaseUrl } from '../config'

const API_D = `${getApiBaseUrl()}/api/v1/districts`

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function StatCard({ icon, value, label, color }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)', flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: color || 'var(--accent-blue)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 3 }}>{label}</div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{label?.slice(0, 7)}</div>
      <div style={{ color: 'var(--accent-blue)' }}>FIRs: <b>{fmt(payload[0]?.value)}</b></div>
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

  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const stLayerRef = useRef(null)

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

  // Init mini-map
  useEffect(() => {
    if (mapInst.current) return
    const map = L.map(mapRef.current, { center: [14.5, 76.5], zoom: 7, zoomControl: false, attributionControl: false })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map)
    mapInst.current = map
    return () => { map.remove(); mapInst.current = null }
  }, [])

  function selectDistrict(name) {
    setSelected(name)
    const map = mapInst.current

    Promise.all([
      fetch(`${API_D}/${encodeURIComponent(name)}`).then(r => r.json()),
      fetch(`${API_D}/${encodeURIComponent(name)}/stations`).then(r => r.json()),
      fetch(`${API_D}/${encodeURIComponent(name)}/trend`).then(r => r.json()),
    ]).then(([prof, sts, tr]) => {
      setProfile(prof)
      setStations(sts)
      setTrend(tr)

      if (map) {
        if (stLayerRef.current) map.removeLayer(stLayerRef.current)
        const markers = sts.filter(s => s.lat && s.lng).map(s => {
          const maxFirs = Math.max(...sts.map(x => x.fir_count), 1)
          const ratio = s.fir_count / maxFirs
          const icon = L.divIcon({
            html: `<div style="width:${6+ratio*12}px;height:${6+ratio*12}px;background:#38bdf8;border-radius:50%;border:1.5px solid white;opacity:0.85;"></div>`,
            className: '', iconAnchor: [7, 7]
          })
          return L.marker([s.lat, s.lng], { icon }).bindTooltip(`${s.name}<br/>FIRs: ${s.fir_count.toLocaleString()}`)
        })
        const g = L.layerGroup(markers).addTo(map)
        stLayerRef.current = g
        if (markers.length > 0) {
          const bounds = markers.map(m => m.getLatLng())
          map.fitBounds(bounds, { padding: [20, 20], maxZoom: 10 })
        }
      }
    }).catch(console.error)
  }

  const filteredDistricts = districts
    .filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0))

  const maxFirs = Math.max(...districts.map(d => d.total_firs), 1)

  return (
    <>
      <div className="page-header">
        <h2>🏙️ District Intelligence<span className="badge">30 DISTRICTS</span></h2>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Karnataka · Click district to explore</div>
      </div>

      <div className="filter-row">
        <input id="district-search" className="filter-input" style={{ minWidth: 200 }}
          placeholder="🔍  Search district…" value={search} onChange={e => setSearch(e.target.value)} />
        <span className="filter-label">Sort by</span>
        <select id="sort-select" className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="total_firs">FIR Count</option>
          <option value="arrest_rate">Arrest Rate</option>
          <option value="crime_rate_per_100k">Crime per 100K</option>
          <option value="total_victims">Victims</option>
        </select>
        {loading && <span style={{ fontSize: 11, color: 'var(--accent-blue)' }}>⏳ Loading…</span>}
      </div>

      <div className="district-layout">
        {/* District List */}
        <div className="district-list">
          {filteredDistricts.map((d, i) => {
            const ratio = d.total_firs / maxFirs
            const rankColor = i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#f97316' : 'var(--text-muted)'
            return (
              <div key={d.name} id={`district-${d.name.replace(/\s+/g,'')}`}
                className={`district-list-item ${selected === d.name ? 'selected' : ''}`}
                onClick={() => selectDistrict(d.name)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: rankColor, width: 18 }}>#{d.crime_rank}</span>
                  <span className="d-name">{d.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 3, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                    <div style={{ width: `${ratio * 100}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: 2 }} />
                  </div>
                  <span className="d-count">{fmt(d.total_firs)}</span>
                </div>
                {sortBy === 'arrest_rate' && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    Arrest rate: <span style={{ color: 'var(--accent-green)' }}>{d.arrest_rate?.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* District Profile */}
        <div className="district-profile">
          {!profile && !loading && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 60 }}>Select a district to view its profile</div>
          )}

          {profile && (
            <>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{profile.name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {profile.earliest_fir?.slice(0, 10)} – {profile.latest_fir?.slice(0, 10)} · {profile.station_count} police stations · {profile.unique_crime_types} crime types
                </p>
              </div>

              {/* KPI row */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <StatCard icon="📋" value={fmt(profile.total_firs)} label="Total FIRs" color="var(--accent-blue)" />
                <StatCard icon="🔒" value={`${profile.arrest_rate?.toFixed(1)}%`} label="Arrest Rate" color="var(--accent-green)" />
                {profile.population && <StatCard icon="👥" value={fmt(profile.population)} label="Population" color="var(--accent-purple)" />}
                {profile.literacy_rate && <StatCard icon="📚" value={`${profile.literacy_rate?.toFixed(1)}%`} label="Literacy" color="var(--accent-amber)" />}
                {profile.crime_rate_per_100k && <StatCard icon="📊" value={profile.crime_rate_per_100k?.toFixed(0)} label="Per 100K pop" color="var(--accent-red)" />}
              </div>

              {/* Map + Trend */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="panel" style={{ height: 220 }}>
                  <div className="panel-header"><h3>📍 Station Map</h3><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stations.length} stations</span></div>
                  <div ref={mapRef} style={{ height: 'calc(100% - 44px)' }} />
                </div>

                <div className="panel" style={{ height: 220 }}>
                  <div className="panel-header"><h3>📈 Monthly Trend</h3></div>
                  <div className="panel-body" style={{ paddingTop: 8 }}>
                    <ResponsiveContainer width="100%" height={155}>
                      <AreaChart data={trend} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="dGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickFormatter={v => v?.slice(0,7)} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickFormatter={fmt} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="count" stroke="#a78bfa" fill="url(#dGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Stations Table */}
              <div className="panel">
                <div className="panel-header">
                  <h3>🏠 Top Police Stations in {profile.name}</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ranked by FIR count</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Station</th>
                        <th>FIRs</th>
                        <th>Accused</th>
                        <th>Arrested</th>
                        <th>Arrest %</th>
                        <th>Conviction %</th>
                        <th>Top Crime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stations.map((s, i) => (
                        <tr key={s.name}>
                          <td>
                            <div className="rank-badge" style={{ background: i < 3 ? 'rgba(251,191,36,0.15)' : 'var(--bg-elevated)', color: i < 3 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                              {i + 1}
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.name}</td>
                          <td className="mono" style={{ color: 'var(--accent-blue)' }}>{fmt(s.fir_count)}</td>
                          <td className="mono">{fmt(s.accused)}</td>
                          <td className="mono">{fmt(s.arrested)}</td>
                          <td>
                            <span style={{ color: s.arrest_rate > 60 ? 'var(--accent-green)' : s.arrest_rate > 30 ? 'var(--accent-amber)' : 'var(--accent-red)', fontWeight: 600 }}>
                              {s.arrest_rate?.toFixed(1)}%
                            </span>
                          </td>
                          <td>
                            <span style={{ color: s.conviction_rate > 60 ? 'var(--accent-green)' : 'var(--text-secondary)', fontWeight: 600 }}>
                              {s.conviction_rate?.toFixed(1)}%
                            </span>
                          </td>
                          <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{s.top_crime || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
