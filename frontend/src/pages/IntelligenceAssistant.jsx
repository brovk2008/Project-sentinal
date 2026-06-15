import { useState, useEffect, useRef } from 'react'
import { getApiBaseUrl } from '../config'

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
      .then(data => setHealth(data))
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
          mode: data.mode || 'unknown',
          confidence: data.confidence !== undefined ? data.confidence : 1.0,
          sources: data.sources || [],
          analytics_data: data.analytics_data || null
        }

        if (isBriefing) {
          answerText = data.briefing || ''
        } else {
          answerText = data.answer || ''
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

  // Format confidence color
  const getConfidenceColor = (score) => {
    if (score === null || score === undefined) return 'var(--text-muted)'
    if (score > 0.8) return 'var(--success)'
    if (score > 0.5) return 'var(--warning)'
    return 'var(--critical)'
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
      
      {/* LEFT PANEL: Chat Workstation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
        
        {/* Workspace Title */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>INTELLIGENCE ASSISTANT // TERM-SENTINEL-v5.1</span>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>Hybrid RAG Operations Analyst</h2>
          </div>
          
          {/* Health indicator badge */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>DB:</span>
              <span style={{ fontSize: 10, color: health.database === 'connected' ? 'var(--success)' : 'var(--critical)', fontWeight: 600 }}>
                {health.database.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>OLLAMA:</span>
              <span style={{ fontSize: 10, color: health.ollama_qwen_model === 'available' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                {health.ollama_qwen_model === 'available' ? 'ONLINE (QWEN)' : 'OFFLINE (FALLBACK)'}
              </span>
            </div>
          </div>
        </div>

        {/* Terminal Message Stream */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((msg, index) => (
            <div 
              key={index}
              style={{
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: msg.sender === 'user' ? '70%' : '90%',
                background: msg.sender === 'user' ? 'var(--bg-card)' : 'transparent',
                border: msg.sender === 'user' ? '1px solid var(--border)' : 'none',
                padding: msg.sender === 'user' ? '12px 16px' : '0px',
                borderRadius: 4
              }}
            >
              {msg.sender !== 'user' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: msg.isError ? 'var(--critical)' : 'var(--text-secondary)' }}>
                    {msg.sender === 'system' ? 'SYSTEM_LOG' : 'SENTINEL_AI'}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{msg.timestamp}</span>
                </div>
              )}
              
              <div 
                style={{ 
                  fontSize: 13, 
                  lineHeight: 1.6, 
                  color: msg.isError ? 'var(--critical)' : 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: msg.sender === 'user' ? 'inherit' : 'inherit'
                }}
              >
                {msg.text}
              </div>
              
              {msg.sender === 'user' && (
                <div style={{ textAlign: 'right', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                  {msg.timestamp}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>SENTINEL_AI</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>processing...</span>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 20 }}>
                <span className="live-dot" style={{ background: 'var(--warning)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Scanning vector space & analytics databases...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{ padding: 18, borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
          
          {/* Quick recommendations */}
          <div style={{ marginBottom: 12 }}>
            <div className="label-xs" style={{ marginBottom: 6 }}>Suggested Intelligence Directives</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sampleQuestions.map(sq => (
                <button
                  key={sq.label}
                  onClick={() => executeIntelligenceQuery(sq.q)}
                  disabled={loading}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    padding: '4px 10px',
                    fontSize: 10,
                    borderRadius: 3,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-focus)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }}
                >
                  {sq.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', alignSelf: 'center', color: 'var(--text-muted)', fontSize: 14 }}>&gt;</span>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question (e.g. 'Show crime trends in Bengaluru' or 'counter-terrorism rules')"
              disabled={loading}
              style={{
                flex: 1,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '10px 14px',
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--border-focus)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '0 20px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              QUERY
            </button>
          </form>
        </div>

      </div>

      {/* RIGHT SIDEBAR: Metadata Viewer / Evidence Inspector */}
      <div style={{ width: 320, background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        
        {/* Title */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="label-xs">Evidence Inspector</div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: 'var(--text-primary)' }}>RAG Analysis Metadata</h3>
        </div>

        {/* Section 1: Intent Routing */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="label-xs" style={{ marginBottom: 6 }}>Intent Router Path</div>
          <div 
            className="mono" 
            style={{ 
              background: 'var(--bg-primary)', 
              border: '1px solid var(--border)', 
              padding: '6px 10px', 
              fontSize: 11,
              borderRadius: 3,
              color: activeMetadata.mode === 'db_analytics_sql' ? 'var(--warning)' : activeMetadata.mode === 'llm_grounded' ? 'var(--success)' : 'var(--text-primary)',
              fontWeight: 700
            }}
          >
            {activeMetadata.mode.toUpperCase() || 'IDLE'}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
            {activeMetadata.mode === 'db_analytics_sql' && 'Query directly executed as an optimized PostgreSQL analytics query (<1s).'}
            {activeMetadata.mode === 'llm_grounded' && 'Query processed via hybrid document retrieval and synthesized locally via Qwen2.5-1.5B.'}
            {activeMetadata.mode === 'fallback_retrieval_only' && 'Ollama offline. Running retrieval-only fallback output with citations.'}
            {activeMetadata.mode === 'idle' && 'Await directive input to execute routing decision.'}
          </p>
        </div>

        {/* Section 2: Confidence Indicator */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="label-xs" style={{ marginBottom: 6 }}>Source Confidence Index</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              fontSize: 24, 
              fontFamily: 'JetBrains Mono, monospace', 
              fontWeight: 800, 
              color: getConfidenceColor(activeMetadata.confidence) 
            }}>
              {activeMetadata.confidence !== null ? `${Math.round(activeMetadata.confidence * 100)}%` : '--'}
            </div>
            
            <div style={{ flex: 1, height: 6, background: 'var(--bg-primary)', borderRadius: 3, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  background: getConfidenceColor(activeMetadata.confidence), 
                  width: activeMetadata.confidence !== null ? `${activeMetadata.confidence * 100}%` : '0%' 
                }} 
              />
            </div>
          </div>
        </div>

        {/* Section 3: Database Analytics Context */}
        {activeMetadata.analytics_data && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
            <div className="label-xs" style={{ marginBottom: 6 }}>SQL Analytics Payload</div>
            <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 3 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    {activeMetadata.analytics_data.columns?.map(col => (
                      <th key={col} style={{ padding: '4px 6px', color: 'var(--text-secondary)' }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeMetadata.analytics_data.data?.map((row, rIdx) => (
                    <tr key={rIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                      {activeMetadata.analytics_data.columns?.map(col => (
                        <td key={col} className="mono" style={{ padding: '4px 6px', color: 'var(--text-primary)' }}>{String(row[col])}</td>
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
          
          {activeMetadata.sources.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
              No document evidence active for current log.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeMetadata.sources.map((src, sIdx) => (
                <div 
                  key={sIdx}
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    padding: 8,
                    borderRadius: 3
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {src}
                    </span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>DOC_{sIdx + 1}</span>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Primary reference source file matched during pgvector vector similarity scan.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      
    </div>
  )
}
