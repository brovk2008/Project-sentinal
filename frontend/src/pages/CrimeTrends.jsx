import { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  CartesianGrid
} from 'recharts'
import KPICard from '../components/KPICard.jsx'
import { getApiBaseUrl } from '../config'

const API = `${getApiBaseUrl()}/api/v1/trends`
const COLORS = ['#38bdf8','#a78bfa','#34d399','#fbbf24','#f87171','#f472b6','#22d3ee','#fb923c','#818cf8','#4ade80']

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>{p.name}: <b>{fmt(p.value)}</b></div>
      ))}
    </div>
  )
}

export default function CrimeTrends() {
  const [granularity, setGranularity] = useState('month')
  const [crimeGroup] = useState('')
  const [district] = useState('')

  const [timeseries, setTimeseries] = useState([])
  const [byGroup, setByGroup] = useState([])
  const [topCrimes, setTopCrimes] = useState([])
  const [dow, setDow] = useState([])
  const [yoy, setYoy] = useState([])
  const [funnel, setFunnel] = useState([])
  const [loading, setLoading] = useState(true)

  // Total KPIs from timeseries
  const totalFIRs = timeseries.reduce((s, r) => s + r.count, 0)
  const totalVictims = timeseries.reduce((s, r) => s + r.victims, 0)
  const totalArrested = timeseries.reduce((s, r) => s + r.arrested, 0)
  const totalAccused = timeseries.reduce((s, r) => s + r.accused, 0)
  const arrestRate = totalAccused > 0 ? ((totalArrested / totalAccused) * 100).toFixed(1) : '—'
  const latestYoy = yoy.length >= 2 ? yoy[yoy.length - 1]?.growth_pct : null

  useEffect(() => {
    let active = true
    setTimeout(() => { if (active) setLoading(true) }, 0)
    const p = new URLSearchParams()
    p.set('granularity', granularity)
    if (crimeGroup) p.set('crime_group', crimeGroup)
    if (district) p.set('district', district)

    Promise.all([
      fetch(`${API}/timeseries?${p}`).then(r => r.json()),
      fetch(`${API}/by-crime-group`).then(r => r.json()),
      fetch(`${API}/top-crimes?limit=20`).then(r => r.json()),
      fetch(`${API}/day-of-week`).then(r => r.json()),
      fetch(`${API}/yoy`).then(r => r.json()),
      fetch(`${API}/funnel`).then(r => r.json()),
    ]).then(([ts, bg, tc, d, y, fn]) => {
      if (!active) return
      setTimeseries(ts)
      setByGroup(bg.slice(0, 10))
      setTopCrimes(tc)
      setDow(d)
      setYoy(y)
      setFunnel(fn)
      setLoading(false)
    }).catch(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [granularity, crimeGroup, district])

  // Shorten long labels for bar chart
  const topCrimesForChart = topCrimes.slice(0, 12).map(c => ({
    ...c,
    shortHead: c.head.length > 28 ? c.head.slice(0, 28) + '…' : c.head
  }))

  return (
    <>
      <div className="page-header">
        <h2>📈 Crime Trends — Karnataka Police Analytics<span className="badge">REAL DATA</span></h2>
        <div className="toggle-group" style={{ width: 200 }}>
          {[['month','Monthly'],['year','Yearly']].map(([v,l]) => (
            <button key={v} id={`gran-${v}`} className={`toggle-btn ${granularity===v?'active':''}`} onClick={() => setGranularity(v)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner" /><span>Loading analytics…</span></div>
      ) : (
        <div className="page-body">
          {/* KPIs */}
          <div className="kpi-grid">
            <KPICard icon="📋" value={fmt(totalFIRs)} label="Total FIRs" gradient="var(--grad-blue)" change={latestYoy} />
            <KPICard icon="👥" value={fmt(totalVictims)} label="Total Victims" gradient="var(--grad-red)" />
            <KPICard icon="⚖️" value={fmt(totalAccused)} label="Accused" gradient="var(--grad-purple)" />
            <KPICard icon="🔒" value={`${arrestRate}%`} label="Arrest Rate" gradient="var(--grad-green)" />
          </div>

          {/* Time Series Area Chart */}
          <div style={{ padding: '0 24px 20px' }}>
            <div className="panel">
              <div className="panel-header">
                <h3>📈 FIR Count Over Time</h3>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeseries.length} data points</div>
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={timeseries} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                    <defs>
                      <linearGradient id="tsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                      tickFormatter={v => granularity === 'year' ? v : v?.slice(0, 7)} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={fmt} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="count" name="FIRs" stroke="#38bdf8" fill="url(#tsGrad)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="arrested" name="Arrested" stroke="#34d399" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row: Top crimes + By group pie */}
          <div style={{ padding: '0 24px 20px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
            {/* Top Crimes Bar */}
            <div className="panel">
              <div className="panel-header">
                <h3>🏆 Top Crime Types</h3>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ranked by FIR count</div>
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topCrimesForChart} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="shortHead" width={180} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="FIRs" radius={[0, 4, 4, 0]}>
                      {topCrimesForChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Crime Group Pie */}
            <div className="panel">
              <div className="panel-header"><h3>🥧 Crime Categories</h3></div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={byGroup} dataKey="count" nameKey="group" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                      {byGroup.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ maxHeight: 80, overflowY: 'auto', marginTop: 8 }}>
                  {byGroup.map((g, i) => (
                    <div key={g.group} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, fontSize: 11 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{g.group}</span>
                      <span style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono', fontWeight: 600 }}>{fmt(g.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Row: Day of Week Radar + Conviction Funnel */}
          <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Day of Week Radar */}
            <div className="panel">
              <div className="panel-header"><h3>📅 Crime by Day of Week</h3></div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={dow} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="day_name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                    <Radar name="FIRs" dataKey="count" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.25} strokeWidth={2} />
                    <Tooltip formatter={fmt} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* YoY + Funnel */}
            <div className="panel">
              <div className="panel-header"><h3>⚖️ Justice Pipeline</h3><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Accused → Arrested → Convicted</span></div>
              <div className="panel-body">
                {funnel.map((stage, i) => {
                  const colors = ['#38bdf8', '#34d399', '#a78bfa']
                  return (
                    <div key={stage.stage} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{stage.stage}</span>
                        <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: colors[i] }}>
                          {fmt(stage.value)} ({stage.pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="risk-bar-wrap">
                        <div className="risk-bar-fill" style={{ width: `${stage.pct}%`, background: colors[i] }} />
                      </div>
                    </div>
                  )
                })}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Year-over-Year Growth</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {yoy.map(y => (
                      <div key={y.year} style={{
                        padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: y.growth_pct > 0 ? 'rgba(248,113,113,0.15)' : y.growth_pct < 0 ? 'rgba(52,211,153,0.15)' : 'var(--bg-elevated)',
                        color: y.growth_pct > 0 ? 'var(--accent-red)' : y.growth_pct < 0 ? 'var(--accent-green)' : 'var(--text-muted)',
                        border: '1px solid var(--border)'
                      }}>
                        {y.year}: {y.growth_pct > 0 ? '+' : ''}{y.growth_pct.toFixed(1)}%
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
