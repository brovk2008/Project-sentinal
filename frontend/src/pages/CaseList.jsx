import React, { useState, useEffect } from 'react'
import { getApiBaseUrl } from '../config.js'

export default function CaseList({ onSelectCase }) {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Create case modal fields
  const [name, setName] = useState('')
  const [type, setType] = useState('crime-analysis')
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Phase 2 Lifecycle State
  const [activeMenuCaseId, setActiveMenuCaseId] = useState(null)
  const [activeTab, setActiveTab] = useState('active') // 'active' | 'archived'

  const apiBase = getApiBaseUrl()

  const fetchCases = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${apiBase}/api/v2/cases/`)
      if (!res.ok) throw new Error('Failed to load cases')
      const data = await res.json()
      setCases(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCases()
  }, [])

  // Close card action menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuCaseId(null)
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const handleCreateCase = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    
    try {
      setSubmitting(true)
      const res = await fetch(`${apiBase}/api/v2/cases/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type })
      })
      if (!res.ok) throw new Error('Failed to create case')
      const data = await res.json()
      setName('')
      setShowModal(false)
      fetchCases()
      // Automatically navigate to the new case
      onSelectCase(data.case_id)
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDuplicateCase = async (e, c) => {
    e.stopPropagation()
    setActiveMenuCaseId(null)
    const newName = prompt("Enter name for duplicated case:", `${c.name} (Copy)`)
    if (!newName) return
    try {
      setLoading(true)
      const res = await fetch(`${apiBase}/api/v2/cases/${c.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          type: c.type,
          ontology_version: c.ontology_version,
          created_by: c.created_by || 'analyst'
        })
      })
      if (!res.ok) throw new Error('Failed to duplicate case')
      fetchCases()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleArchiveCase = async (e, c) => {
    e.stopPropagation()
    setActiveMenuCaseId(null)
    try {
      setLoading(true)
      const res = await fetch(`${apiBase}/api/v2/cases/${c.id}/archive`, {
        method: 'POST'
      })
      if (!res.ok) throw new Error('Failed to update case status')
      fetchCases()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCase = async (e, c) => {
    e.stopPropagation()
    setActiveMenuCaseId(null)
    if (!confirm(`Are you sure you want to soft-delete case "${c.name}"?\nThis cannot be undone easily.`)) return
    try {
      setLoading(true)
      const res = await fetch(`${apiBase}/api/v2/cases/${c.id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete case')
      fetchCases()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredCases = cases.filter(c => {
    if (c.status === 'deleted') return false
    if (activeTab === 'active') {
      return c.status === 'active' || !c.status
    } else {
      return c.status === 'archived'
    }
  })

  return (
    <div className="case-list-page" style={{ padding: '2rem', color: 'var(--text-primary)', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', color: 'var(--accent)', margin: 0 }}>Intelligence Cases</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Manage, switch, or create structured investigation contexts</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, #b06935 100%)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(200, 129, 74, 0.25)',
            transition: 'all 0.2s'
          }}
        >
          + New Case
        </button>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '2px' }}>
        <button 
          onClick={() => setActiveTab('active')} 
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'active' ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: activeTab === 'active' ? '2px solid var(--accent)' : 'none',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600'
          }}
        >
          Active Cases ({cases.filter(c => c.status === 'active' || !c.status).length})
        </button>
        <button 
          onClick={() => setActiveTab('archived')} 
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'archived' ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: activeTab === 'archived' ? '2px solid var(--accent)' : 'none',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600'
          }}
        >
          Archived Cases ({cases.filter(c => c.status === 'archived').length})
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton skeleton-card" style={{ width: '300px', borderRadius: '8px', border: '1px solid var(--border)' }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--critical)', borderRadius: '6px', color: '#f87171' }}>
          Error: {error}
        </div>
      ) : filteredCases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'var(--bg-panel)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
          <h3 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>No {activeTab} cases found</h3>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem 0' }}>Get started by creating your first structured investigation context.</p>
          <button 
            onClick={() => setShowModal(true)}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Create Case
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {filteredCases.map((c) => (
            <div 
              key={c.id}
              onClick={() => onSelectCase(c.id)}
              style={{
                backgroundColor: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '1.5rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                position: 'relative',
                overflow: 'visible'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.transform = 'none'
              }}
            >
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '4px',
                height: '100%',
                backgroundColor: c.type === 'crime-analysis' ? 'var(--accent)' : '#3b82f6'
              }} />
              
              {/* Ellipsis Actions Menu */}
              <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10 }}>
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveMenuCaseId(activeMenuCaseId === c.id ? null : c.id)
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    padding: '0 0.5rem',
                    outline: 'none'
                  }}
                >
                  ⋮
                </button>
                {activeMenuCaseId === c.id && (
                  <div 
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '1.5rem',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-mid)',
                      borderRadius: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      width: '120px',
                      zIndex: 100
                    }}
                  >
                    <button 
                      onClick={(e) => handleDuplicateCase(e, c)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 1rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        display: 'block'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      Duplicate
                    </button>
                    <button 
                      onClick={(e) => handleArchiveCase(e, c)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 1rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        display: 'block'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      {c.status === 'archived' ? 'Unarchive' : 'Archive'}
                    </button>
                    <button 
                      onClick={(e) => handleDeleteCase(e, c)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 1rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--critical)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        display: 'block'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', width: '85%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-elevated)', padding: '0.25rem 0.5rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                  {c.type === 'crime-analysis' ? 'Crime Analysis' : c.type === 'disaster-response' ? 'Disaster Response' : 'Fraud Investigation'}
                </span>
                <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-elevated)', padding: '0.25rem 0.5rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                  {c.ontology_version}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <span>By {c.created_by}</span>
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <form onSubmit={handleCreateCase} style={{
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '2rem',
            width: '400px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ margin: '0 0 1.5rem 0', color: 'var(--accent)' }}>Create Intelligence Case</h2>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Case Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Operation Black Hawk"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'white',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Ontology Vertical</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'white',
                  boxSizing: 'border-box'
                }}
              >
                <option value="crime-analysis">Crime Analysis (Seed Ontology)</option>
                <option value="disaster-response">Disaster Response</option>
                <option value="fraud-investigation">Financial Fraud Investigation</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button 
                type="button" 
                onClick={() => setShowModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem 1rem'
                }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitting}
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
