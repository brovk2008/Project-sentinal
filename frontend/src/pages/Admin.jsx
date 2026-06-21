import React, { useState, useEffect } from 'react'
import { getApiBaseUrl } from '../config.js'

export default function Admin() {
  const [health, setHealth] = useState(null)
  const [loadingHealth, setLoadingHealth] = useState(true)
  const [rbacUsers, setRbacUsers] = useState([
    { username: 'analyst_primary', role: 'Owner', email: 'analyst@sentinel.gov' },
    { username: 'officer_karnataka', role: 'Editor', email: 'officer.ka@sentinel.gov' },
    { username: 'director_general', role: 'Viewer', email: 'dg@sentinel.gov' }
  ])
  const [auditLogs, setAuditLogs] = useState([
    { timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), user: 'analyst_primary', action: 'RAG Ingestion', details: 'Uploaded and vectorized file "ACID ATTACK.pdf"' },
    { timestamp: new Date(Date.now() - 3600000).toISOString(), user: 'analyst_primary', action: 'Graph Write', details: 'Added supporting evidence to Hypothesis "Financing network link"' },
    { timestamp: new Date().toISOString(), user: 'officer_karnataka', action: 'Case Config', details: 'Modified Connections Board layout bounds' }
  ])

  const apiBase = getApiBaseUrl()

  const fetchHealth = async () => {
    try {
      setLoadingHealth(true)
      const res = await fetch(`${apiBase}/health`)
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      } else {
        throw new Error('Health check endpoint error')
      }
    } catch (err) {
      setHealth({
        status: 'unhealthy',
        catalyst_datastore: 'error',
        catalyst_filestore: 'error',
        groq_api: 'offline',
        vector_search: 'offline',
        groq: 'offline',
        gemini: 'offline',
        hf: 'offline',
        nasa: 'offline',
        google_maps: 'offline',
        mapillary: 'offline',
        indian_kanoon: 'offline',
        firecrawl: 'offline',
        tavily: 'offline'
      })
    } finally {
      setLoadingHealth(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  const handleRoleChange = (username, newRole) => {
    setRbacUsers(prev => prev.map(u => u.username === username ? { ...u, role: newRole } : u))
    
    // Add to simulated audit log
    const log = {
      timestamp: new Date().toISOString(),
      user: 'analyst_primary',
      action: 'RBAC Edit',
      details: `Changed role of user "${username}" to "${newRole}"`
    }
    setAuditLogs(prev => [log, ...prev])
  }

  return (
    <div style={{ padding: '2rem', height: '100%', overflowY: 'auto', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: 'var(--accent)', margin: 0 }}>System Administration</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Monitor provider health, manage case permissions, and inspect access logs</p>
      </header>

      {/* Grid columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* Card 1: Provider Health */}
        <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <h3 style={{ color: 'var(--accent)', margin: 0 }}>LLM Provider & Datastore Health</h3>
            <button 
              onClick={fetchHealth} 
              disabled={loadingHealth}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--border-mid)',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
                padding: '0.25rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              {loadingHealth ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {loadingHealth ? (
            <div className="skeleton" style={{ height: '300px', borderRadius: '4px' }} />
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Global System Status</span>
                <span className={health?.status === 'healthy' ? 'badge-success' : 'badge-critical'}>
                  {health?.status?.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Datastore (SQLite/ZCQL)</span>
                <span className={health?.catalyst_datastore === 'online' ? 'badge-success' : 'badge-critical'}>
                  {health?.catalyst_datastore?.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Filestore Ingestion Directory</span>
                <span className={health?.catalyst_filestore === 'online' ? 'badge-success' : 'badge-critical'}>
                  {health?.catalyst_filestore?.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Vector Embeddings (SentenceTransformers)</span>
                <span className={health?.vector_search === 'ready' ? 'badge-success' : 'badge-critical'}>
                  {health?.vector_search?.toUpperCase()}
                </span>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '1rem' }}>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem', fontWeight: 600 }}>External API Providers</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {[
                    { id: 'groq', name: 'Groq API (Llama 3.3)' },
                    { id: 'gemini', name: 'Gemini API (2.5 Flash)' },
                    { id: 'hf', name: 'HuggingFace Embeddings' },
                    { id: 'nasa', name: 'NASA FIRMS API' },
                    { id: 'google_maps', name: 'Google Maps API' },
                    { id: 'mapillary', name: 'Mapillary API' },
                    { id: 'indian_kanoon', name: 'Indian Kanoon API' },
                    { id: 'firecrawl', name: 'Firecrawl API' },
                    { id: 'tavily', name: 'Tavily Search API' },
                  ].map(provider => {
                    const isAvailable = health?.[provider.id] === 'available';
                    return (
                      <div key={provider.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-base)', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{provider.name}</span>
                        <span className={isAvailable ? 'badge-success' : 'badge-critical'} style={{ fontSize: '0.75rem' }}>
                          {isAvailable ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Case RBAC (Role-Based Access Control) */}
        <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ color: 'var(--accent)', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            Case Collaborators Permissions
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {rbacUsers.map(user => (
                <tr key={user.username}>
                  <td><span className="mono">{user.username}</span></td>
                  <td>{user.email}</td>
                  <td>
                    <select 
                      value={user.role} 
                      onChange={(e) => handleRoleChange(user.username, e.target.value)}
                      className="tb-select"
                      style={{ padding: '2px 4px', fontSize: '0.75rem' }}
                    >
                      <option value="Owner">Owner</option>
                      <option value="Editor">Editor</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Card 3: Audit Logs */}
        <div style={{ gridColumn: '1 / -1', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ color: 'var(--accent)', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            Case Security & Access Audit Log
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operator</th>
                <th>Action Class</th>
                <th>Activity Description</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log, idx) => (
                <tr key={idx}>
                  <td className="mono" style={{ fontSize: '0.75rem' }}>{log.timestamp}</td>
                  <td className="mono" style={{ color: 'var(--accent)' }}>{log.user}</td>
                  <td><span className="badge-neutral">{log.action}</span></td>
                  <td>{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
