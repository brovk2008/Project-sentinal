import React, { useState, useEffect } from 'react'

export default function EntityResolutionManager({ caseId, apiBase, onLoadGraph }) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState('unresolved') // 'unresolved' | 'resolved' | 'dismissed'
  const [notesInputs, setNotesInputs] = useState({}) // matchKey -> notes text

  const fetchResolutions = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/resolution`)
      if (res.ok) {
        const data = await res.json()
        setMatches(data)
      }
    } catch (err) {
      console.error("Failed to fetch entity resolutions", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResolutions()
  }, [caseId])

  const handleAction = async (match, status) => {
    const key = `${match.source_entity.id}-${match.target_entity.id}`
    const notes = notesInputs[key] || ''
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/resolution/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id_1: match.source_entity.id,
          entity_id_2: match.target_entity.id,
          status,
          notes
        })
      })
      if (res.ok) {
        alert(`Match successfully marked as ${status}!`)
        fetchResolutions()
        if (onLoadGraph) onLoadGraph() // refresh parent graph
      }
    } catch (err) {
      console.error(err)
      alert("Error saving resolution link: " + err.message)
    }
  }

  const handleNotesChange = (key, text) => {
    setNotesInputs(prev => ({ ...prev, [key]: text }))
  }

  const filteredMatches = matches.filter(m => m.resolution_status === activeSubTab)

  if (loading) {
    return (
      <div style={{ padding: '2rem', color: 'var(--text-muted)' }} className="animate-pulse">
        <h3>Scanning Cross-Case Databases...</h3>
        <div className="skeleton" style={{ height: '80px', margin: '1rem 0' }} />
        <div className="skeleton" style={{ height: '80px', margin: '1rem 0' }} />
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', height: '100%', overflowY: 'auto', boxSizing: 'border-box', backgroundColor: 'var(--bg-base)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ color: 'var(--accent)', margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Cross-Case Entity Resolution</h2>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
            Identify and merge duplicate identities across investigations using semantic & identifier keys.
          </p>
        </div>
        <button 
          onClick={fetchResolutions}
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600
          }}
        >
          Rescan Graphs
        </button>
      </div>

      {/* Sub Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
        {[
          { id: 'unresolved', label: `Potential Duplicates (${matches.filter(m => m.resolution_status === 'unresolved').length})` },
          { id: 'resolved', label: `Linked Entities (${matches.filter(m => m.resolution_status === 'resolved').length})` },
          { id: 'dismissed', label: `Dismissed (${matches.filter(m => m.resolution_status === 'dismissed').length})` }
        ].map((subTab) => (
          <button
            key={subTab.id}
            onClick={() => setActiveSubTab(subTab.id)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: activeSubTab === subTab.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeSubTab === subTab.id ? '2px solid var(--accent)' : 'none',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem'
            }}
          >
            {subTab.label}
          </button>
        ))}
      </div>

      {filteredMatches.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '6px' }}>
          <i style={{ fontSize: '2rem', display: 'block', marginBottom: '1rem' }}>🛡️</i>
          <h4>No {activeSubTab} resolution records found.</h4>
          <p style={{ fontSize: '0.8rem' }}>Run a scan or add more entities to find cross-case connections.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {filteredMatches.map((match, idx) => {
            const matchKey = `${match.source_entity.id}-${match.target_entity.id}`
            const src = match.source_entity
            const tgt = match.target_entity

            return (
              <div 
                key={idx}
                style={{
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-panel)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header */}
                <div style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(200, 129, 74, 0.08)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.85rem' }}>
                    ⚠️ {match.match_reason}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Type: <strong style={{ color: 'white' }}>{src.type}</strong>
                  </span>
                </div>

                {/* Compare Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem' }}>
                  {/* Left (Current Case) */}
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>CURRENT CASE ENTITY</div>
                    <div style={{ fontWeight: 'bold', color: 'white', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                      {src.properties.name || src.properties.number || src.properties.registration || 'Unnamed Entity'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {Object.entries(src.properties).map(([k, v]) => (
                        <div key={k} style={{ margin: '0.2rem 0' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {String(v)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right (Other Case) */}
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      MATCHING ENTITY IN: <strong style={{ color: 'var(--accent)' }}>{match.target_case_name}</strong>
                    </div>
                    <div style={{ fontWeight: 'bold', color: 'white', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                      {tgt.properties.name || tgt.properties.number || tgt.properties.registration || 'Unnamed Entity'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {Object.entries(tgt.properties).map(([k, v]) => (
                        <div key={k} style={{ margin: '0.2rem 0' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {String(v)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions / Notes footer */}
                <div style={{
                  padding: '1rem',
                  borderTop: '1px solid var(--border)',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: '60px' }}>Notes:</label>
                    <input 
                      type="text"
                      placeholder="Add investigation comments or link notes..."
                      value={notesInputs[matchKey] || match.notes || ''}
                      onChange={(e) => handleNotesChange(matchKey, e.target.value)}
                      style={{
                        flex: 1,
                        padding: '0.4rem 0.6rem',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '0.8rem'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                    {activeSubTab === 'unresolved' && (
                      <>
                        <button 
                          onClick={() => handleAction(match, 'dismissed')}
                          style={{
                            backgroundColor: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            padding: '0.4rem 1rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600
                          }}
                        >
                          Dismiss Match
                        </button>
                        <button 
                          onClick={() => handleAction(match, 'resolved')}
                          style={{
                            backgroundColor: 'var(--accent)',
                            border: 'none',
                            color: 'white',
                            padding: '0.4rem 1.2rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600
                          }}
                        >
                          Link & Resolve
                        </button>
                      </>
                    )}
                    {activeSubTab === 'resolved' && (
                      <button 
                        onClick={() => handleAction(match, 'unresolved')}
                        style={{
                          backgroundColor: 'transparent',
                          border: '1px solid #ef4444',
                          color: '#ef4444',
                          padding: '0.4rem 1rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600
                        }}
                      >
                        Unlink / Reset
                      </button>
                    )}
                    {activeSubTab === 'dismissed' && (
                      <button 
                        onClick={() => handleAction(match, 'unresolved')}
                        style={{
                          backgroundColor: 'transparent',
                          border: '1px solid var(--accent)',
                          color: 'var(--accent)',
                          padding: '0.4rem 1rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600
                        }}
                      >
                        Re-evaluate Match
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
