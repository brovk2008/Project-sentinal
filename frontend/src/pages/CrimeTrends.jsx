import { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  CartesianGrid
} from 'recharts'
import KPICard from '../components/KPICard.jsx'
import Topbar from '../components/Topbar.jsx'
import { getApiBaseUrl } from '../config'

const API = `${getApiBaseUrl()}/api/v1/trends`

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 3, padding: '10px 14px', fontSize: 11 }}>
      <div style={{ fontWeight: 500, marginBottom: 6, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text-secondary)', marginBottom: 2, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}:</span>
          <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 500 }}>{fmt(p.value)}</span>
        </div>
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
    shortHead: c.head.length > 24 ? c.head.slice(0, 24) + '…' : c.head
  }))

  const controls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', textTransform: 'uppercase' }}>Period</span>
      <div className="seg">
        {[['month', 'Monthly'], ['year', 'Yearly']].map(([v, l]) => (
          <button
            key={v}
            id={`gran-${v}`}
            className={`seg-btn ${granularity === v ? 'active' : ''}`}
            onClick={() => setGranularity(v)}
          >
            {l}
          </button>
        ))}
      </div>
      {loading && <span style={{ fontSize: 10, color: 'var(--accent)' }}>⏳ Loading…</span>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar
        title="Crime Trends — Karnataka"
        meta={`ANALYTICS · ${timeseries.length} DATA POINTS`}
        controls={controls}
      />

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>
        {loading ? (
          <div className="page-loader">
            <div className="loader-ring" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* KPIs */}
            <div className="kpi-grid">
              <KPICard
                value={fmt(totalFIRs)}
                label="Total FIRs"
                sub="Cumulative case records"
                change={latestYoy}
              />
              <KPICard
                value={fmt(totalVictims)}
                label="Total Victims"
                sub="Injured or affected persons"
              />
              <KPICard
                value={fmt(totalAccused)}
                label="Accused Profiles"
                sub="Named in FIR records"
              />
              <KPICard
                value={`${arrestRate}%`}
                label="Arrest Rate"
                sub="Accused apprehended ratio"
              />
            </div>

            {/* Time Series Area Chart */}
            <div style={{ background: 'var(--bg-panel)', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>FIR Count Over Time</h3>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>TIMESERIES DATA TRENDS</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeseries} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <defs>
                    <linearGradient id="tsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="period"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => granularity === 'year' ? v : v?.slice(0, 7)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmt}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-mid)', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="FIRs"
                    stroke="var(--accent)"
                    fill="url(#tsGrad)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="arrested"
                    name="Arrested"
                    stroke="var(--text-muted)"
                    fill="none"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Row: Top crimes + By group pie */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 1, background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
              {/* Top Crimes Bar */}
              <div style={{ background: 'var(--bg-panel)', padding: '20px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Top Crime Types</h3>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>RANKED BY TOTAL CASE COUNT</div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topCrimesForChart} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="shortHead" width={140} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)', opacity: 0.3 }} />
                    <Bar dataKey="count" name="FIRs" radius={[0, 2, 2, 0]}>
                      {topCrimesForChart.map((_, i) => (
                        <Cell
                          key={i}
                          fill={i === 0 ? 'var(--accent)' : 'var(--text-muted)'}
                          opacity={i === 0 ? 0.9 : 0.4 - (i * 0.025)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Crime Group Pie */}
              <div style={{ background: 'var(--bg-panel)', padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Crime Categories</h3>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>DISTRIBUTION OF MAJORS</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byGroup}
                        dataKey="count"
                        nameKey="group"
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        paddingAngle={2}
                      >
                        {byGroup.map((_, i) => (
                          <Cell
                            key={i}
                            fill={i === 0 ? 'var(--accent)' : 'var(--text-secondary)'}
                            opacity={i === 0 ? 0.9 : 0.6 - (i * 0.05)}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ overflowY: 'auto', flex: 1, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  {byGroup.map((g, i) => (
                    <div key={g.group} style={{ display: 'flex', alignItems: 'center', justifyBehavior: 'space-between', gap: 8, marginBottom: 6, fontSize: 10 }}>
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: i === 0 ? 'var(--accent)' : 'var(--text-secondary)',
                        opacity: i === 0 ? 0.9 : 0.6 - (i * 0.05),
                        flexShrink: 0
                      }} />
                      <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{g.group}</span>
                      <span style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>{fmt(g.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row: Day of Week Radar + Conviction Funnel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)' }}>
              {/* Day of Week Radar */}
              <div style={{ background: 'var(--bg-panel)', padding: '20px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Crime by Day of Week</h3>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>WEEKDAY INTENSITY DISTRIBUTION</div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={dow} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="day_name" tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} />
                    <Radar name="FIRs" dataKey="count" stroke="var(--text-secondary)" fill="var(--text-secondary)" fillOpacity={0.08} strokeWidth={1} />
                    <Tooltip content={<CustomTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* YoY + Funnel */}
              <div style={{ background: 'var(--bg-panel)', padding: '20px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Justice Pipeline</h3>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>CASE PROGRESSION EFFICIENCY</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {funnel.map((stage, i) => (
                    <div key={stage.stage}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-primary)' }}>{stage.stage}</span>
                        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: i === 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {fmt(stage.value)} ({stage.pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={{ height: 2, background: 'var(--border)', position: 'relative' }}>
                        <div style={{
                          height: 2,
                          background: i === 0 ? 'var(--accent)' : 'var(--text-muted)',
                          width: `${stage.pct}%`
                        }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 16 }}>
                  <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: 'var(--text-ghost)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Year-over-Year Growth</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {yoy.map(y => (
                      <div key={y.year} style={{
                        padding: '3px 6px',
                        borderRadius: 2,
                        fontSize: 9.5,
                        fontFamily: 'JetBrains Mono',
                        background: 'var(--bg-elevated)',
                        color: y.growth_pct > 0 ? 'var(--accent)' : 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        gap: 4
                      }}>
                        <span>{y.year}:</span>
                        <span>{y.growth_pct > 0 ? '+' : ''}{y.growth_pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

