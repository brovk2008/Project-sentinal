import React, { useState, useEffect } from 'react'
import { getApiBaseUrl } from '../config.js'

export default function CaseDetailsSidePanel({ 
  entity, 
  caseId, 
  onClose, 
  onAddEntity, 
  onRefresh,
  relationships = [],
  entities = []
}) {
  const isRelationship = !!entity.source_entity_id
  const isHypothesisNode = entity.type === 'Hypothesis'
  const isAIProposed = entity.created_by === 'AI Planner Agent' || entity.source === 'AI Planner Agent'

  const [newTag, setNewTag] = useState('')
  const [editingProps, setEditingProps] = useState({ ...(entity.properties || {}) })
  const [editingConfidence, setEditingConfidence] = useState(entity.confidence ?? 1.0)
  const [editingTags, setEditingTags] = useState([...(entity.tags || [])])
  const [editingLabel, setEditingLabel] = useState(entity.label || '')
  
  const apiBase = getApiBaseUrl()
  const [hypDetails, setHypDetails] = useState(null)
  const [selectedRelId, setSelectedRelId] = useState('')
  const [isSupports, setIsSupports] = useState(true)

  useEffect(() => {
    if (isRelationship) {
      setEditingLabel(entity.label || '')
      setEditingConfidence(entity.confidence ?? 1.0)
    } else {
      setEditingProps({ ...(entity.properties || {}) })
      setEditingConfidence(entity.confidence ?? 1.0)
      setEditingTags([...(entity.tags || [])])
    }
  }, [entity, isRelationship])

  useEffect(() => {
    if (isHypothesisNode) {
      fetch(`${apiBase}/api/v2/cases/${caseId}/graph/hypotheses`)
        .then(res => res.json())
        .then(data => {
          const match = data.find(h => h.id === entity.id)
          if (match) {
            setHypDetails(match)
            const linkedIds = new Set((match.supporting_evidence || []).map(item => item.relationship_id))
            const unlinked = relationships.filter(r => !linkedIds.has(r.id))
            if (unlinked.length > 0) {
              setSelectedRelId(unlinked[0].id)
            } else {
              setSelectedRelId('')
            }
          }
        })
        .catch(err => console.error(err))
    }
  }, [entity, caseId, relationships, isHypothesisNode])

  const handleAddTag = () => {
    if (!newTag.trim()) return
    if (!editingTags.includes(newTag.trim())) {
      setEditingTags(prev => [...prev, newTag.trim()])
    }
    setNewTag('')
  }

  const handleRemoveTag = (tagToRemove) => {
    setEditingTags(prev => prev.filter(t => t !== tagToRemove))
  }

  const handlePropChange = (key, val) => {
    setEditingProps(prev => ({ ...prev, [key]: val }))
  }

  const handleSaveChanges = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/entities/${entity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: editingProps,
          confidence: editingConfidence,
          tags: editingTags,
          location: entity.location,
          modified_by: 'analyst'
        })
      })
      if (res.ok) {
        alert("Entity saved successfully!")
        onRefresh()
      } else {
        const errData = await res.json()
        alert(`Failed to save: ${errData.detail || 'Unknown error'}`)
      }
    } catch (err) {
      console.error(err)
      alert("Error saving: " + err.message)
    }
  }

  const handleSaveRelationshipChanges = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/relationships/${entity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editingLabel,
          confidence: editingConfidence,
          evidence: entity.evidence || [],
          modified_by: 'analyst'
        })
      })
      if (res.ok) {
        alert("Relationship saved successfully!")
        onRefresh()
      } else {
        const errData = await res.json()
        alert(`Failed to save: ${errData.detail || 'Unknown error'}`)
      }
    } catch (err) {
      console.error(err)
      alert("Error saving: " + err.message)
    }
  }

  const handleConfirmAISuggestion = async () => {
    try {
      if (isRelationship) {
        const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/relationships/${entity.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: entity.label,
            confidence: entity.confidence,
            evidence: entity.evidence,
            created_by: 'analyst',
            modified_by: 'analyst'
          })
        })
        if (res.ok) {
          alert("AI Relationship suggestion confirmed!")
          onRefresh()
          onClose()
        } else {
          const errData = await res.json()
          alert(`Failed to confirm: ${errData.detail || 'Unknown error'}`)
        }
      } else {
        const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/entities/${entity.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: entity.properties,
            confidence: entity.confidence,
            tags: entity.tags,
            location: entity.location,
            source: 'manual',
            created_by: 'analyst',
            modified_by: 'analyst'
          })
        })
        if (res.ok) {
          alert("AI Entity suggestion confirmed!")
          onRefresh()
          onClose()
        } else {
          const errData = await res.json()
          alert(`Failed to confirm: ${errData.detail || 'Unknown error'}`)
        }
      }
    } catch (err) {
      console.error(err)
      alert("Error confirming suggestion: " + err.message)
    }
  }

  const handleRejectAISuggestion = async () => {
    if (!confirm(`Are you sure you want to reject and delete this AI suggested ${isRelationship ? 'relationship' : 'entity'}?`)) return
    try {
      const endpoint = isRelationship 
        ? `${apiBase}/api/v2/cases/${caseId}/graph/relationships/${entity.id}`
        : `${apiBase}/api/v2/cases/${caseId}/graph/entities/${entity.id}`
      const res = await fetch(endpoint, {
        method: 'DELETE'
      })
      if (res.ok) {
        alert("AI Suggestion rejected and deleted.")
        onRefresh()
        onClose()
      } else {
        alert("Failed to delete suggestion.")
      }
    } catch (err) {
      console.error(err)
      alert("Error rejecting suggestion: " + err.message)
    }
  }

  const handleLinkEvidence = async () => {
    if (!selectedRelId) return
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/hypotheses/${entity.id}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationship_id: selectedRelId,
          supports: isSupports
        })
      })
      if (res.ok) {
        const data = await res.json()
        setHypDetails(prev => {
          const updatedEvidence = [
            ...(prev?.supporting_evidence || []),
            { relationship_id: selectedRelId, supports: isSupports }
          ]
          const updatedHistory = [
            ...(prev?.history || []),
            { confidence: prev?.confidence || 1.0, timestamp: new Date().toISOString() }
          ]
          return {
            ...prev,
            confidence: data.new_confidence,
            supporting_evidence: updatedEvidence,
            history: updatedHistory
          }
        })
        onRefresh()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleConvertToHypothesis = async () => {
    const defaultStmt = entity.properties?.name || entity.properties?.number || entity.properties?.registration || ''
    const statement = prompt("Enter hypothesis statement:", defaultStmt)
    if (!statement) return
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/hypotheses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement, status: 'open', created_by: 'analyst' })
      })
      if (res.ok) {
        onRefresh()
        alert("Created Hypothesis node successfully!")
      }
    } catch (err) {
      console.error(err)
    }
  }

  const srcNode = isRelationship ? entities.find(e => e.id === entity.source_entity_id) : null
  const tgtNode = isRelationship ? entities.find(e => e.id === entity.target_entity_id) : null
  const sourceNodeName = srcNode?.properties?.name || srcNode?.properties?.number || srcNode?.properties?.registration || 'Entity'
  const targetNodeName = tgtNode?.properties?.name || tgtNode?.properties?.number || tgtNode?.properties?.registration || 'Entity'

  return (
    <div style={{
      position: 'absolute',
      right: '360px', // Docked right next to the chat panel
      top: 0,
      bottom: 0,
      width: '320px',
      backgroundColor: '#111827',
      borderLeft: '1px solid #1f2937',
      boxShadow: '-10px 0 20px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 20
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #1f2937',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h3 style={{ margin: 0, color: '#c8814a', fontSize: '1rem' }}>
            {isRelationship ? 'INSPECT RELATIONSHIP' : 'INSPECT ENTITY'}
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            {isRelationship ? `${entity.relationship_type} relationship` : `${entity.type} node details`}
          </span>
        </div>
        <button 
          onClick={onClose}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: '1.2rem'
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {isRelationship ? (
          /* RELATIONSHIP VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {isAIProposed && (
              <div style={{
                padding: '0.85rem',
                backgroundColor: 'rgba(200, 129, 74, 0.1)',
                border: '1px solid var(--accent)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.8rem' }}>
                  <span>🤖</span>
                  <span>AI SUGGESTED RELATIONSHIP</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af', lineHeight: '1.3' }}>
                  Staged automatically with 85% confidence. Confirm to assert provenance, or Reject to remove it.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleConfirmAISuggestion}
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--accent)',
                      border: 'none',
                      color: 'white',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={handleRejectAISuggestion}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #ef4444',
                      color: '#ef4444',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Connection Details</h4>
              <div style={{ padding: '0.75rem', backgroundColor: '#0b0f17', borderRadius: '4px', border: '1px solid #1f2937', fontSize: '0.8rem', display: 'grid', gap: '0.5rem' }}>
                <div><span style={{ color: '#9ca3af' }}>Source:</span> <span style={{ fontWeight: 'bold', color: 'white' }}>{sourceNodeName}</span></div>
                <div><span style={{ color: '#9ca3af' }}>Target:</span> <span style={{ fontWeight: 'bold', color: 'white' }}>{targetNodeName}</span></div>
                <div><span style={{ color: '#9ca3af' }}>Type:</span> <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{entity.relationship_type}</span></div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Relationship Label</h4>
              <input 
                type="text" 
                value={editingLabel} 
                onChange={(e) => setEditingLabel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0b0f17',
                  border: '1px solid #374151',
                  borderRadius: '4px',
                  color: 'white',
                  fontSize: '0.8rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Provenance</h4>
              <div style={{ padding: '0.75rem', backgroundColor: '#0b0f17', borderRadius: '4px', border: '1px solid #1f2937', fontSize: '0.8rem', display: 'grid', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#9ca3af' }}>Confidence:</span>
                  <input 
                    type="number" 
                    step="0.05" 
                    min="0" 
                    max="1" 
                    value={editingConfidence} 
                    onChange={(e) => setEditingConfidence(parseFloat(e.target.value) || 0)} 
                    style={{
                      width: '60px',
                      padding: '0.2rem',
                      backgroundColor: '#111827',
                      border: '1px solid #374151',
                      borderRadius: '4px',
                      color: 'white',
                      fontSize: '0.8rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div><span style={{ color: '#9ca3af' }}>Created by:</span> {entity.created_by || 'analyst'}</div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Evidence References</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                {(entity.evidence || []).map((ev, idx) => (
                  <div key={idx} style={{ padding: '0.5rem', backgroundColor: '#1f2937', borderRadius: '4px', fontSize: '0.75rem', color: '#e5e7eb', border: '1px solid #374151' }}>
                    <div style={{ fontWeight: '600', color: 'var(--accent)', marginBottom: '0.2rem' }}>{ev.type || 'AI Extraction'}</div>
                    <div>{ev.source || 'No details provided'}</div>
                  </div>
                ))}
                {(entity.evidence || []).length === 0 && (
                  <span style={{ fontSize: '0.75rem', color: '#4b5563', fontStyle: 'italic' }}>No linked evidence records</span>
                )}
              </div>
            </div>
          </div>
        ) : isHypothesisNode ? (
          /* HYPOTHESIS VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Statement</h4>
              <div style={{ fontSize: '0.95rem', color: 'white', fontWeight: '600', backgroundColor: '#0b0f17', padding: '0.75rem', borderRadius: '4px', border: '1px solid #1f2937' }}>
                {entity.properties?.name || 'Unnamed Hypothesis'}
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Confidence Metric</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#0b0f17', padding: '0.75rem', borderRadius: '4px', border: '1px solid #1f2937' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#c8814a' }}>
                  {(((hypDetails?.confidence ?? entity.confidence) ?? 1.0) * 100).toFixed(0)}%
                </span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  recalculated from linked evidence
                </span>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Linked Evidence</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                {(hypDetails?.supporting_evidence || []).map((item, idx) => {
                  const rel = relationships.find(r => r.id === item.relationship_id)
                  const srcNode = entities.find(e => e.id === rel?.source_entity_id)
                  const tgtNode = entities.find(e => e.id === rel?.target_entity_id)
                  const srcName = srcNode?.properties?.name || srcNode?.properties?.number || srcNode?.properties?.registration || 'Entity'
                  const tgtName = tgtNode?.properties?.name || tgtNode?.properties?.number || tgtNode?.properties?.registration || 'Entity'
                  const relLabel = rel?.label || rel?.relationship_type || 'connects'
                  
                  return (
                    <div key={idx} style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#1f2937',
                      borderRadius: '4px',
                      border: `1px solid ${item.supports ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      fontSize: '0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ color: '#e5e7eb' }}>
                        {srcName} ➔ <span style={{ color: '#9ca3af' }}>({relLabel})</span> ➔ {tgtName}
                      </span>
                      <span style={{
                        padding: '0.1rem 0.3rem',
                        borderRadius: '3px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        backgroundColor: item.supports ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: item.supports ? '#10b981' : '#ef4444'
                      }}>
                        {item.supports ? 'Supports' : 'Contradicts'}
                      </span>
                    </div>
                  )
                })}
                {(hypDetails?.supporting_evidence || []).length === 0 && (
                  <span style={{ fontSize: '0.75rem', color: '#4b5563', fontStyle: 'italic' }}>No linked evidence relationships</span>
                )}
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Link Evidence Edge</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: '#0b0f17', padding: '0.75rem', borderRadius: '4px', border: '1px solid #1f2937' }}>
                <label style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Select Relationship:</label>
                <select
                  value={selectedRelId}
                  onChange={(e) => setSelectedRelId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '0.75rem'
                  }}
                >
                  <option value="">-- Select relationship --</option>
                  {relationships
                    .filter(r => !(hypDetails?.supporting_evidence || []).some(item => item.relationship_id === r.id))
                    .map(r => {
                      const srcNode = entities.find(e => e.id === r.source_entity_id)
                      const tgtNode = entities.find(e => e.id === r.target_entity_id)
                      const srcName = srcNode?.properties?.name || srcNode?.properties?.number || srcNode?.properties?.registration || 'Entity'
                      const tgtName = tgtNode?.properties?.name || tgtNode?.properties?.number || tgtNode?.properties?.registration || 'Entity'
                      const relLabel = r.label || r.relationship_type || 'connects'
                      return (
                        <option key={r.id} value={r.id}>
                          {srcName} ➔ ({relLabel}) ➔ {tgtName}
                        </option>
                      )
                    })}
                </select>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', color: '#10b981' }}>
                    <input type="radio" checked={isSupports === true} onChange={() => setIsSupports(true)} />
                    Supports
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', color: '#ef4444' }}>
                    <input type="radio" checked={isSupports === false} onChange={() => setIsSupports(false)} />
                    Contradicts
                  </label>
                </div>

                <button
                  onClick={handleLinkEvidence}
                  disabled={!selectedRelId}
                  style={{
                    marginTop: '0.5rem',
                    backgroundColor: selectedRelId ? '#c8814a' : '#1f2937',
                    border: 'none',
                    color: selectedRelId ? 'white' : '#4b5563',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '4px',
                    cursor: selectedRelId ? 'pointer' : 'not-allowed',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                >
                  Link Evidence
                </button>
              </div>
            </div>

            <div>
              <h5 style={{ color: '#9ca3af', margin: '0 0 0.5rem 0', fontSize: '0.75rem' }}>Confidence Log History</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '90px', overflowY: 'auto', fontSize: '0.7rem', backgroundColor: '#0b0f17', padding: '0.5rem', borderRadius: '4px' }}>
                {(hypDetails?.history || []).map((hist, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af' }}>
                    <span>Confidence: {(hist.confidence * 100).toFixed(0)}%</span>
                    <span>{new Date(hist.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
                {(hypDetails?.history || []).length === 0 && <div style={{ color: '#4b5563' }}>No history yet</div>}
              </div>
            </div>
          </div>
        ) : (
          /* STANDARD ENTITY VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {isAIProposed && (
              <div style={{
                padding: '0.85rem',
                backgroundColor: 'rgba(200, 129, 74, 0.1)',
                border: '1px solid var(--accent)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.8rem' }}>
                  <span>🤖</span>
                  <span>AI SUGGESTED ENTITY</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af', lineHeight: '1.3' }}>
                  Staged automatically with 85% confidence. Confirm to assert provenance, or Reject to remove it.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleConfirmAISuggestion}
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--accent)',
                      border: 'none',
                      color: 'white',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={handleRejectAISuggestion}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #ef4444',
                      color: '#ef4444',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

            {/* Properties Form */}
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Properties</h4>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {Object.entries(editingProps).map(([k, v]) => (
                  <div key={k}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', textTransform: 'capitalize', marginBottom: '0.25rem' }}>{k}</label>
                    <input 
                      type="text" 
                      value={v || ''} 
                      onChange={(e) => handlePropChange(k, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        backgroundColor: '#0b0f17',
                        border: '1px solid #374151',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '0.8rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Confidence & Source */}
            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Provenance</h4>
              <div style={{ padding: '0.75rem', backgroundColor: '#0b0f17', borderRadius: '4px', border: '1px solid #1f2937', fontSize: '0.8rem', display: 'grid', gap: '0.4rem' }}>
                <div><span style={{ color: '#9ca3af' }}>Source:</span> {entity.source || 'manual'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#9ca3af' }}>Confidence:</span>
                  <input 
                    type="number" 
                    step="0.05" 
                    min="0" 
                    max="1" 
                    value={editingConfidence} 
                    onChange={(e) => setEditingConfidence(parseFloat(e.target.value) || 0)} 
                    style={{
                      width: '60px',
                      padding: '0.2rem',
                      backgroundColor: '#111827',
                      border: '1px solid #374151',
                      borderRadius: '4px',
                      color: 'white',
                      fontSize: '0.8rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div><span style={{ color: '#9ca3af' }}>Created by:</span> {entity.created_by || 'analyst'}</div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Tags</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {editingTags.map((t, idx) => (
                  <span key={idx} style={{ 
                    fontSize: '0.7rem', 
                    backgroundColor: '#1f2937', 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '4px', 
                    border: '1px solid #374151', 
                    color: '#e5e7eb',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}>
                    {t}
                    <span 
                      onClick={() => handleRemoveTag(t)}
                      style={{ cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }}
                    >
                      ×
                    </span>
                  </span>
                ))}
                {editingTags.length === 0 && (
                  <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>No tags assigned</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  placeholder="Add tag" 
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    backgroundColor: '#0b0f17',
                    border: '1px solid #374151',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '0.75rem'
                  }}
                />
                <button 
                  onClick={handleAddTag}
                  style={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    color: 'white',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Footer controls */}
      <div style={{ padding: '1rem', borderTop: '1px solid #1f2937', backgroundColor: '#111827', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        {isRelationship ? (
          <>
            <button 
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#9ca3af',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Close
            </button>
            <button 
              onClick={handleSaveRelationshipChanges}
              style={{
                backgroundColor: '#10b981',
                border: 'none',
                color: 'white',
                fontWeight: '600',
                padding: '0.5rem 1.25rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Save Changes
            </button>
          </>
        ) : isHypothesisNode ? (
          <button 
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#9ca3af',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            Close
          </button>
        ) : (
          <>
            <button 
              onClick={handleConvertToHypothesis}
              style={{
                backgroundColor: '#111827',
                border: '1px solid #c8814a',
                color: '#c8814a',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
            >
              Mark as Hypothesis
            </button>
            <button 
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#9ca3af',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Close
            </button>
            <button 
              onClick={handleSaveChanges}
              style={{
                backgroundColor: '#10b981',
                border: 'none',
                color: 'white',
                fontWeight: '600',
                padding: '0.5rem 1.25rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Save Changes
            </button>
            <button 
              onClick={() => alert(`Research triggered for entity: ${entity.properties?.name || 'node'}`)}
              style={{
                backgroundColor: '#c8814a',
                border: 'none',
                color: 'white',
                fontWeight: '600',
                padding: '0.5rem 1.25rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Research Node
            </button>
          </>
        )}
      </div>
    </div>
  )
}
