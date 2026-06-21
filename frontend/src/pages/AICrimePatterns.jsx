import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { getApiBaseUrl } from '../config'
import Topbar from '../components/Topbar.jsx'

const API = `${getApiBaseUrl()}/api/v1/ai`

function XAIPanel({ item, type }) {
  if (!item) return (
    <div className="ai-sidebar">
      <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 11 }}>
        Select a station or crime category to view AI grouping analysis
      </div>
    </div>
  )

  const name = type === 'station' ? (item.unit_name || "UNKNOWN") : (item.crime_group_name || "UNKNOWN")
  const total = type === 'station' ? (item.total_firs || 0) : (item.total_firs || 0)
  const confidence = item.confidence || 0.90
  const maxImp = Math.max(...(item.feature_importance || []).map(f => f?.importance || 0), 0.001)

  return (
    <div className="ai-sidebar">
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        <div className="label-xs">{type === 'station' ? 'Station Cluster Analysis' : 'Crime Class Cluster Analysis'}</div>
        <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', marginTop: 4 }}>
          {name}
        </div>
        <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-ghost)', marginTop: 2 }}>
          Assigned to: {item.cluster_label || "None"}
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Key metrics */}
        <div>
          <div className="label-xs" style={{ marginBottom: 8 }}>Cluster Features</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Total Volume', value: total?.toLocaleString() },
              { label: 'Arrest Rate', value: `${(item.arrest_rate || 0).toFixed(1)}%` },
              { label: 'Conviction Rate', value: `${(item.conviction_rate || 0).toFixed(1)}%` },
              { label: 'Cluster Confidence', value: `${Math.round(confidence * 100)}%` },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500 }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Feature importance */}
        {(item.feature_importance || []).length > 0 && (
          <div>
            <div className="label-xs" style={{ marginBottom: 8 }}>Top Cluster Weights</div>
            {(item.feature_importance || []).map(f => (
              <div key={f?.feature || 'unknown'} className="xai-feature-row">
                <div className="xai-feature-name" style={{ fontSize: 8.5 }}>{f?.feature || 'Unknown'}</div>
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
          <div className="label-xs" style={{ marginBottom: 6 }}>Cluster Archetype Profile</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {item.explanation || "No profile details available for this cluster."}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AICrimePatterns() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCluster, setSelectedCluster] = useState(0)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedType, setSelectedType] = useState('station') // 'station' | 'crime'

  useEffect(() => {
    fetch(`${API}/patterns`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        setData(d)
        setLoading(false)
        const stationsList = d?.stations || []
        if (stationsList.length > 0) {
          const firstInCluster = stationsList.find(s => s && s.cluster === 0)
          setSelectedItem(firstInCluster || stationsList[0])
          setSelectedType('station')
        }
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar title="AI Crime Patterns" meta="UNSUPERVISED K-MEANS" controls={null} />
      <div className="page-loader">
        <div className="loader-ring" />
      </div>
    </div>
  )
  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar title="AI Crime Patterns" meta="UNSUPERVISED K-MEANS" controls={null} />
      <div className="error-banner">ERROR: {error}</div>
    </div>
  )

  const cluster_archetypes = data?.cluster_archetypes || {}
  const stations = data?.stations || []
  const crime_groups = data?.crime_groups || []

  // Compute cluster statistics for Recharts and Cards
  const clusterCards = (Object.entries(cluster_archetypes || {}) || []).map(([clusterIdStr, label]) => {
    const cid = parseInt(clusterIdStr)
    const matchingStations = (stations || []).filter(s => s && s.cluster === cid)
    const matchingCrimes = (crime_groups || []).filter(c => c && c.cluster === cid)

    const totalFirs = (matchingStations || []).reduce((sum, s) => sum + (s?.total_firs || 0), 0)
    const avgArrest = (matchingStations || []).length
      ? (matchingStations || []).reduce((sum, s) => sum + (s?.arrest_rate || 0), 0) / (matchingStations || []).length
      : 0
    const avgConvict = (matchingStations || []).length
      ? (matchingStations || []).reduce((sum, s) => sum + (s?.conviction_rate || 0), 0) / (matchingStations || []).length
      : 0

    return {
      id: cid,
      label: label || "UNKNOWN",
      stationCount: (matchingStations || []).length,
      crimeCount: (matchingCrimes || []).length,
      totalFirs,
      avgArrest: Math.round(avgArrest * 10) / 10,
      avgConvict: Math.round(avgConvict * 10) / 10
    }
  })

  // Selected cluster items
  const filteredStations = (stations || []).filter(s => s && s.cluster === selectedCluster)
  const filteredCrimes = (crime_groups || []).filter(c => c && c.cluster === selectedCluster)

  const handleSelectCluster = (cid) => {
    setSelectedCluster(cid)
    const firstStation = (stations || []).find(s => s && s.cluster === cid)
    if (firstStation) {
      setSelectedItem(firstStation)
      setSelectedType('station')
    } else {
      const firstCrime = (crime_groups || []).find(c => c && c.cluster === cid)
      if (firstCrime) {
        setSelectedItem(firstCrime)
        setSelectedType('crime')
      } else {
        setSelectedItem(null)
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar title="AI Crime Patterns" meta="UNSUPERVISED K-MEANS" controls={null} />

      <div className="ai-layout">
        {/* Archetype cluster selector grid */}
        <div className="cluster-grid">
          {(clusterCards || []).map(c => (
            <div
              key={c?.id}
              className={`cluster-card ${selectedCluster === c?.id ? 'active' : ''}`}
              onClick={() => handleSelectCluster(c?.id)}
            >
              <div className="cluster-label" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{c?.label}</div>
              <div className="cluster-count">{c?.stationCount} <span style={{ fontSize: 10, fontWeight: 300, color: 'var(--text-muted)' }}>stations</span></div>
              <div className="cluster-sub">
                Arr {c?.avgArrest || 0}% · Con {c?.avgConvict || 0}%
              </div>
            </div>
          ))}
        </div>

        <div className="ai-split">
          {/* Main Panel */}
          <div className="ai-main" style={{ flex: 1.3, borderRight: '1px solid var(--border)' }}>
            {/* Performance Comparison Chart */}
            <div style={{ padding: '16px 20px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '0 0 10px', background: 'transparent' }}>
                <span className="label-xs">Performance Comparison (Arrests vs Convictions)</span>
              </div>
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clusterCards} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 8 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 8 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                    <Bar dataKey="avgArrest" name="Avg Arrest Rate" fill="var(--text-secondary)" maxBarSize={15} />
                    <Bar dataKey="avgConvict" name="Avg Conviction Rate" fill="var(--accent)" maxBarSize={15} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabbed Split Tables */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Stations Column */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="label-xs">Associated Police Stations</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>{(filteredStations || []).length} units</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Station</th>
                        <th>District</th>
                        <th>FIRs</th>
                        <th>Arrest %</th>
                        <th>Convict %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(filteredStations || []).map(s => (
                        <tr
                          key={s?.unit_id || Math.random()}
                          className={selectedItem?.unit_id === s?.unit_id && selectedType === 'station' ? 'selected' : ''}
                          onClick={() => { setSelectedItem(s); setSelectedType('station') }}
                        >
                          <td style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 11 }}>{s?.unit_name || 'UNKNOWN'}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s?.district_name || 'UNKNOWN'}</td>
                          <td className="mono" style={{ fontSize: 10.5 }}>{(s?.total_firs || 0).toLocaleString()}</td>
                          <td className="mono" style={{ fontSize: 10.5 }}>{(s?.arrest_rate || 0).toFixed(1)}%</td>
                          <td className="mono" style={{ fontSize: 10.5 }}>{(s?.conviction_rate || 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Crime Groups Column */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="label-xs">Associated Crime Categories</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>{(filteredCrimes || []).length} classes</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Crime Category</th>
                        <th>Total FIRs</th>
                        <th>Arrest %</th>
                        <th>Convict %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(filteredCrimes || []).map(c => (
                        <tr
                          key={c?.crime_group_name || Math.random()}
                          className={selectedItem?.crime_group_name === c?.crime_group_name && selectedType === 'crime' ? 'selected' : ''}
                          onClick={() => { setSelectedItem(c); setSelectedType('crime') }}
                        >
                          <td style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 11 }}>{c?.crime_group_name || 'UNKNOWN'}</td>
                          <td className="mono" style={{ fontSize: 10.5 }}>{(c?.total_firs || 0).toLocaleString()}</td>
                          <td className="mono" style={{ fontSize: 10.5 }}>{(c?.arrest_rate || 0).toFixed(1)}%</td>
                          <td className="mono" style={{ fontSize: 10.5 }}>{(c?.conviction_rate || 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* XAI Sidebar */}
          <XAIPanel item={selectedItem} type={selectedType} />
        </div>
      </div>
    </div>
  )
}
