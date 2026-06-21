import React, { useState, useRef, useEffect } from 'react'
import { getApiBaseUrl } from '../config.js'

export default function AICopilotChat({ caseId, onRefreshGraph }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [agentProgress, setAgentProgress] = useState(null)

  // States for Confirm-before-run Planning Checklist Modal
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [proposedSubtasks, setProposedSubtasks] = useState([])
  const [currentGoal, setCurrentGoal] = useState('')

  const chatEndRef = useRef(null)
  const apiBase = getApiBaseUrl()

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, agentProgress])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!input.trim() || running) return

    const userGoal = input.trim()
    setInput('')
    setCurrentGoal(userGoal)
    setRunning(true)
    
    // Add user message to UI
    setMessages(prev => [...prev, { role: 'user', content: userGoal }])
    setAgentProgress({ stage: 'starting', message: 'Generating execution plan...' })

    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/agents/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: userGoal })
      })
      if (!res.ok) throw new Error('Failed to generate plan')
      const data = await res.json()
      
      const subtasksWithSelection = (data.subtasks || []).map((sub, index) => ({
        ...sub,
        id: index,
        selected: true
      }))
      setProposedSubtasks(subtasksWithSelection)
      setShowPlanModal(true)
      setAgentProgress(null)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error generating plan: ${err.message}` }])
      setRunning(false)
      setAgentProgress(null)
    }
  }

  const handleExecutePlan = async () => {
    setShowPlanModal(false)
    const selectedSubtasks = proposedSubtasks.filter(s => s.selected).map(({ id, selected, ...rest }) => rest)
    if (selectedSubtasks.length === 0) {
      setMessages(prev => [...prev, { role: 'assistant', content: "No subtasks were selected. Execution aborted." }])
      setRunning(false)
      return
    }

    setAgentProgress({ stage: 'starting', message: 'Initializing execution for selected tasks...' })

    try {
      const response = await fetch(`${apiBase}/api/v2/cases/${caseId}/agents/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: currentGoal,
          subtasks: selectedSubtasks
        })
      })
      if (!response.ok) throw new Error('API execution request failed')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      
      let buffer = ''
      
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        
        buffer = lines.pop()
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (!dataStr) continue
            
            try {
              const event = JSON.parse(dataStr)
              
              if (event.stage === 'result') {
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: event.data.briefing,
                  findings: event.data.findings,
                  proposed: {
                    entities: event.data.proposed_entities,
                    edges: event.data.proposed_edges
                  }
                }])
                setAgentProgress(null)
                onRefreshGraph()
              } else if (event.stage === 'error') {
                setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.message}` }])
                setAgentProgress(null)
              } else {
                setAgentProgress({
                  stage: event.stage,
                  message: event.message,
                  subtasks: event.subtasks || agentProgress?.subtasks,
                  subtask_index: event.subtask_index !== undefined ? event.subtask_index : agentProgress?.subtask_index
                })
              }
            } catch (err) {
              console.error('Failed to parse SSE event:', err)
            }
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error executing goal: ${err.message}` }])
      setAgentProgress(null)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #1f2937', backgroundColor: '#111827' }}>
        <h3 style={{ margin: 0, color: '#c8814a', fontSize: '1rem' }}>AI COPILOT CHAT</h3>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Multi-agent reasoning terminal</span>
      </div>

      {/* Messages Viewport */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 1rem', fontSize: '0.9rem' }}>
            Ask the Planner Agent to run multi-source searches, analyze IPC statutes, or trace transactions.
          </div>
        )}

        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: msg.role === 'user' ? '#c8814a' : '#1f2937',
              color: 'white',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              maxWidth: '85%',
              wordBreak: 'break-word',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
              {msg.role === 'user' ? 'Analyst' : 'Planner Agent'}
            </div>
            
            {/* Message Body */}
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.4' }}>
              {msg.content}
            </div>

            {/* AI Proposed Graph updates info prompt */}
            {msg.proposed && (msg.proposed.entities.length > 0 || (msg.proposed.edges && msg.proposed.edges.length > 0)) && (
              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '0.75rem', color: '#c8814a', fontWeight: '600', marginBottom: '0.5rem' }}>
                  Proposed AI Suggestions Staged ({msg.proposed.entities.length} Nodes, {msg.proposed.edges?.length || 0} Edges)
                </div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af', lineHeight: '1.3' }}>
                  Inspect dashed copper nodes and lines on the Connections Board to confirm or reject suggestions.
                </p>
              </div>
            )}
          </div>
        ))}

        {/* Live SSE progress layout */}
        {agentProgress && (
          <div style={{
            alignSelf: 'flex-start',
            backgroundColor: '#111827',
            border: '1px solid #1f2937',
            color: '#e5e7eb',
            padding: '1rem',
            borderRadius: '8px',
            width: '85%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span className="pulse-dot" style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#c8814a',
                borderRadius: '50%'
              }} />
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#c8814a' }}>
                Reasoning Progress
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
              {agentProgress.message}
            </div>

            {/* List subtasks checklist */}
            {agentProgress.subtasks && (
              <div style={{ fontSize: '0.75rem', display: 'grid', gap: '0.25rem', marginTop: '0.5rem', borderTop: '1px solid #1f2937', paddingTop: '0.5rem' }}>
                {agentProgress.subtasks.map((task, sIdx) => {
                  const isCurrent = agentProgress.subtask_index === sIdx
                  const isCompleted = agentProgress.subtask_index > sIdx
                  return (
                    <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isCompleted ? '#10b981' : isCurrent ? '#c8814a' : '#4b5563' }}>
                      <span>{isCompleted ? '✓' : isCurrent ? '⚡' : '○'}</span>
                      <span>{task.task}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        
        <div ref={chatEndRef} />
      </div>

      {/* Input panel */}
      <form onSubmit={handleSend} style={{ padding: '1rem', borderTop: '1px solid #1f2937', backgroundColor: '#111827', display: 'flex', gap: '0.5rem' }}>
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={running ? 'Agent pipeline executing...' : 'Ask copilot...'}
          disabled={running}
          style={{
            flex: 1,
            padding: '0.75rem',
            backgroundColor: '#0b0f17',
            border: '1px solid #374151',
            borderRadius: '6px',
            color: 'white',
            fontSize: '0.85rem'
          }}
        />
        <button 
          type="submit" 
          disabled={running || !input.trim()}
          style={{
            backgroundColor: running || !input.trim() ? '#1f2937' : '#c8814a',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.25rem',
            borderRadius: '6px',
            cursor: running || !input.trim() ? 'not-allowed' : 'pointer',
            fontWeight: '600'
          }}
        >
          Send
        </button>
      </form>

      {/* Plan Checklist Modal Overlay */}
      {showPlanModal && (
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
          zIndex: 10000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid var(--accent)',
            borderRadius: '8px',
            width: '500px',
            maxWidth: '90%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '1.25rem',
              borderBottom: '1px solid #1f2937',
              backgroundColor: '#0f172a'
            }}>
              <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.1rem', fontWeight: 'bold' }}>Confirm Investigation Plan</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                Select the subtasks you want the AI Planner Agent to execute:
              </p>
            </div>
            
            {/* Subtasks List */}
            <div style={{
              padding: '1.25rem',
              maxHeight: '300px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              {proposedSubtasks.map((sub) => (
                <label 
                  key={sub.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    backgroundColor: '#1f2937',
                    borderRadius: '6px',
                    border: '1px solid #374151',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#374151'}
                >
                  <input 
                    type="checkbox"
                    checked={sub.selected}
                    onChange={() => {
                      setProposedSubtasks(prev => prev.map(item => item.id === sub.id ? { ...item, selected: !item.selected } : item))
                    }}
                    style={{ marginTop: '0.15rem', cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: '500' }}>{sub.task}</span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.65rem',
                        backgroundColor: 'var(--bg-panel)',
                        color: 'var(--accent)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        border: '1px solid rgba(200, 129, 74, 0.3)',
                        textTransform: 'uppercase'
                      }}>{sub.agent_type}</span>
                      {sub.query && (
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                          q: "{sub.query}"
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            
            {/* Footer */}
            <div style={{
              padding: '1rem 1.25rem',
              borderTop: '1px solid #1f2937',
              backgroundColor: '#0f172a',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem'
            }}>
              <button
                type="button"
                onClick={() => {
                  setShowPlanModal(false)
                  setRunning(false)
                  setAgentProgress(null)
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #374151',
                  color: '#9ca3af',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePlan}
                style={{
                  backgroundColor: 'var(--accent)',
                  border: 'none',
                  color: 'white',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '600'
                }}
              >
                Execute Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
