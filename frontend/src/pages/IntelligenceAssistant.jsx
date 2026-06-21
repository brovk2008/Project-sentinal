import { useState, useEffect, useRef } from 'react'
import { getApiBaseUrl } from '../config'
import Topbar from '../components/Topbar.jsx'

const API = `${getApiBaseUrl()}/api/v1/intelligence`

export default function IntelligenceAssistant() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Conversation history
  const [messages, setMessages] = useState([
    {
      sender: 'system',
      text: 'Project Sentinel Hybrid RAG Intelligence Terminal active. Enter a question regarding regional crime statistics, financial transaction networks, or official policy documents (PDFs).',
      timestamp: new Date().toLocaleTimeString(),
    }
  ])
  
  // Last query metadata
  const [activeMetadata, setActiveMetadata] = useState({
    mode: 'idle',
    confidence: null,
    sources: [],
    analytics_data: null
  })

  // System Health
  const [health, setHealth] = useState({
    status: 'loading',
    database: 'offline',
    pgvector_extension: 'missing',
    ollama_qwen_model: 'offline_or_missing_model'
  })

  const messagesEndRef = useRef(null)

  useEffect(() => {
    // Check health on load
    fetch(`${API}/health`)
      .then(res => res.json())
      .then(data => {
        setHealth({
          status: data?.status || 'unhealthy',
          database: data?.database || data?.catalyst_datastore || 'offline',
          pgvector_extension: data?.pgvector_extension || data?.vector_search || 'missing',
          ollama_qwen_model: data?.ollama_qwen_model || data?.groq_api || 'offline'
        })
      })
      .catch(() => setHealth({
        status: 'unhealthy',
        database: 'offline',
        pgvector_extension: 'missing',
        ollama_qwen_model: 'offline'
      }))
  }, [])

  useEffect(() => {
    // Scroll to bottom of terminal chat
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sampleQuestions = [
    { label: 'Crime Trends (Bagalkot)', q: 'Show crime trends in Bagalkot' },
    { label: 'Top Crimes (Bengaluru)', q: 'Top crime groups in Bengaluru' },
    { label: 'Highest Arrest Rate', q: 'District with highest arrest rate' },
    { label: 'Compare Districts', q: 'Compare Belagavi and Mysuru' },
    { label: 'Acid Attack Rules', q: 'What are the rules regarding Acid Attacks?' },
    { label: 'Counter-Terrorism Infrastructure', q: 'What is the counter-terrorism infrastructure in Karnataka?' },
    { label: 'Financial Crime Increase (Hybrid)', q: 'Why is financial crime increasing in Karnataka?' },
    { label: 'Technology Briefing', q: 'Create intelligence briefing on Technology' }
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    const queryStr = question.trim()
    if (!queryStr) return
    
    executeIntelligenceQuery(queryStr)
  }

  const executeIntelligenceQuery = (queryStr) => {
    setLoading(true)
    setError(null)
    setQuestion('')
    
    // Add user message to log
    setMessages(prev => [...prev, {
      sender: 'user',
      text: queryStr,
      timestamp: new Date().toLocaleTimeString()
    }])

    const isBriefing = queryStr.toLowerCase().startsWith('create intelligence briefing') || queryStr.toLowerCase().startsWith('briefing:')
    const url = isBriefing ? `${API}/briefing` : `${API}/query`
    const body = isBriefing 
      ? { topic: queryStr.replace(/create intelligence briefing on/i, '').replace(/create intelligence briefing/i, '').replace(/briefing:/i, '').trim() || 'General' }
      : { question: queryStr }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(res => {
        if (!res.ok) throw new Error(`Query failed: ${res.statusText}`)
        return res.json()
      })
      .then(data => {
        setLoading(false)
        
        let answerText = ''
        let metadata = {
          mode: data?.mode || 'unknown',
          confidence: data?.confidence !== undefined ? data.confidence : 1.0,
          sources: data?.sources || [],
          analytics_data: data?.analytics_data || null
        }

        if (isBriefing) {
          answerText = data?.briefing || ''
        } else {
          answerText = data?.answer || ''
        }

        setMessages(prev => [...prev, {
          sender: 'assistant',
          text: answerText,
          timestamp: new Date().toLocaleTimeString(),
          isBriefing: isBriefing
        }])

        setActiveMetadata(metadata)
      })
      .catch(err => {
        setLoading(false)
        setError(err.message)
        setMessages(prev => [...prev, {
          sender: 'system',
          text: `SYSTEM ERROR: Failed to execute query. Details: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
          isError: true
        }])
      })
  }

  const controls = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span className="label-xs" style={{ color: 'var(--text-secondary)' }}>DB:</span>
        <span className="mono" style={{ fontSize: 9, color: (health?.database || 'offline').toLowerCase() === 'connected' || (health?.database || 'offline').toLowerCase() === 'online' ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 500 }}>
          {(health?.database || 'UNKNOWN').toUpperCase()}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span className="label-xs" style={{ color: 'var(--text-secondary)' }}>OLLAMA/GROQ:</span>
        <span className="mono" style={{ fontSize: 9, color: (health?.ollama_qwen_model || 'offline').toLowerCase() === 'available' || (health?.ollama_qwen_model || 'offline').toLowerCase() === 'online' ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 500 }}>
          {(health?.ollama_qwen_model || 'offline').toLowerCase() === 'available' || (health?.ollama_qwen_model || 'offline').toLowerCase() === 'online' ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <Topbar title="Intelligence Assistant" meta="HYBRID RAG // TERM-SENTINEL-v5.1" controls={controls} />

      <div className="content">
        {/* LEFT PANEL: Chat Workstation */}
        <div className="terminal-page" style={{ flex: 1, borderRight: '1px solid var(--border)' }}>
          {/* Terminal Message Stream */}
          <div className="terminal-body">
            {(messages || []).map((msg, index) => {
              if (!msg) return null;
              const role = msg.sender === 'user' ? 'INVESTIGATOR' : msg.sender === 'system' ? 'SYSTEM_LOG' : 'SENTINEL_AI';
              return (
                <div key={index} className={`term-msg ${msg.sender === 'user' ? 'user' : 'assistant'}`}>
                  <div className="term-role">
                    {role} · {msg.timestamp}
                  </div>
                  <div className="term-content" style={{ color: msg.isError ? 'var(--critical)' : undefined, whiteSpace: 'pre-wrap' }}>
                    {msg.text}
                  </div>
                </div>
              )
            })}
            {loading && (
              <div className="term-msg assistant">
                <div className="term-role">SENTINEL_AI · processing...</div>
                <div className="term-content" style={{ color: 'var(--text-muted)' }}>
                  Scanning vector index & analytics databases...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick recommendations */}
          <div style={{ padding: '8px 18px 0', background: 'var(--bg-base)' }}>
            <div className="label-xs" style={{ marginBottom: 6 }}>Suggested Directives</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sampleQuestions.map(sq => (
                <button
                  key={sq.label}
                  onClick={() => executeIntelligenceQuery(sq.q)}
                  disabled={loading}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-dim)',
                    padding: '4px 8px',
                    fontSize: '9.5px',
                    fontFamily: 'JetBrains Mono, monospace',
                    cursor: 'pointer',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-mid)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text-dim)'
                  }}
                >
                  {sq.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input form */}
          <form onSubmit={handleSubmit} className="terminal-input-area">
            <span className="term-caret">&gt;</span>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question (e.g. 'Show crime trends in Bengaluru' or 'counter-terrorism rules')"
              disabled={loading}
              className="term-input"
            />
            <button
              type="submit"
              disabled={loading}
              className="term-send"
            >
              <i className="ti ti-send" />
            </button>
          </form>
        </div>

        {/* RIGHT SIDEBAR: Metadata Viewer / Evidence Inspector */}
        <div className="ai-sidebar" style={{ width: 320 }}>
          {/* Title */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="label-xs">Evidence Inspector</div>
            <h3 style={{ fontSize: 11.5, fontWeight: 500, marginTop: 4, color: 'var(--text-primary)' }}>RAG Analysis Metadata</h3>
          </div>

          {/* Section 1: Intent Routing */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="label-xs" style={{ marginBottom: 6 }}>Intent Router Path</div>
            <div 
              className="mono" 
              style={{ 
                background: 'var(--bg-base)', 
                border: '1px solid var(--border)', 
                padding: '6px 10px', 
                fontSize: 10.5,
                color: (activeMetadata?.mode || 'idle') === 'db_analytics_sql' ? 'var(--accent)' : (activeMetadata?.mode || 'idle') === 'llm_grounded' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: 500
              }}
            >
              {(activeMetadata?.mode || 'IDLE').toUpperCase()}
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              {(activeMetadata?.mode || 'idle') === 'db_analytics_sql' && 'Executed directly as an optimized database SQL analytics query (<1s).'}
              {(activeMetadata?.mode || 'idle') === 'llm_grounded' && 'Synthesized via hybrid document retrieval and Groq API completion.'}
              {(activeMetadata?.mode || 'idle') === 'fallback_retrieval_only' && 'Running retrieval-only fallback output with citations.'}
              {(activeMetadata?.mode || 'idle') === 'idle' && 'Await directive input to execute routing decision.'}
            </p>
          </div>

          {/* Section 2: Confidence Indicator */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="label-xs" style={{ marginBottom: 6 }}>Source Confidence Index</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ 
                fontSize: 25, 
                fontFamily: 'Inter, sans-serif', 
                fontWeight: 300, 
                color: activeMetadata?.confidence !== null && activeMetadata?.confidence !== undefined ? 'var(--accent)' : 'var(--text-muted)'
              }}>
                {activeMetadata?.confidence !== null && activeMetadata?.confidence !== undefined ? `${Math.round(activeMetadata.confidence * 100)}%` : '--'}
              </div>
              
              <div className="risk-bar-wrap">
                <div 
                  className="risk-bar-fill" 
                  style={{ 
                    background: 'var(--accent)',
                    width: activeMetadata?.confidence !== null && activeMetadata?.confidence !== undefined ? `${activeMetadata.confidence * 100}%` : '0%' 
                  }} 
                />
              </div>
            </div>
          </div>

          {/* Section 3: Database Analytics Context */}
          {activeMetadata?.analytics_data && (
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)' }}>
              <div className="label-xs" style={{ marginBottom: 6 }}>SQL Analytics Payload</div>
              <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 3 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {(activeMetadata.analytics_data?.columns || []).map(col => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeMetadata.analytics_data?.data || []).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {(activeMetadata.analytics_data?.columns || []).map(col => (
                          <td key={col} className="mono">{String(row && col ? row[col] : '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 4: Document Evidence Sources */}
          <div style={{ padding: '16px 20px', flex: 1 }}>
            <div className="label-xs" style={{ marginBottom: 8 }}>Retrieved Document Contexts</div>
            
            {(activeMetadata?.sources || []).length === 0 ? (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                No active references.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(activeMetadata?.sources || []).map((src, sIdx) => (
                  <div 
                    key={sIdx}
                    style={{
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border)',
                      padding: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 9, fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {(src || 'UNKNOWN')}
                      </span>
                      <span className="mono" style={{ fontSize: 8, color: 'var(--text-muted)' }}>REF_{sIdx + 1}</span>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Reference source matched during vector similarity retrieval search.
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
