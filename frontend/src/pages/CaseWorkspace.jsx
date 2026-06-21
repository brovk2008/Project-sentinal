import React, { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getApiBaseUrl } from '../config.js'
import ConnectionsBoard from '../components/ConnectionsBoard.jsx'
import AICopilotChat from '../components/AICopilotChat.jsx'
import TimelineSlider from '../components/TimelineSlider.jsx'
import CaseDetailsSidePanel from '../components/CaseDetailsSidePanel.jsx'
import EntityResolutionManager from '../components/EntityResolutionManager.jsx'

// Subcomponent: 2D GIS Map Overlay
function CaseMap({ entities }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    // Extract entities with coordinates
    const locations = entities.map(ent => {
      const lat = parseFloat(ent.properties.lat || ent.properties.latitude || ent.properties.lat_coord)
      const lng = parseFloat(ent.properties.lng || ent.properties.longitude || ent.properties.lng_coord)
      return { lat, lng, entity: ent }
    }).filter(loc => !isNaN(loc.lat) && !isNaN(loc.lng))

    const center = locations.length > 0 ? [locations[0].lat, locations[0].lng] : [12.9716, 77.5946] // Bengaluru default
    
    const map = L.map(mapRef.current, {
      center: center,
      zoom: locations.length > 0 ? 12 : 8,
      zoomControl: true,
      attributionControl: false
    })

    const isOps = document.documentElement.getAttribute('data-theme') === 'ops-black'
    const tileUrl = isOps || document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    
    L.tileLayer(tileUrl, { maxZoom: 18 }).addTo(map)

    locations.forEach(loc => {
      const name = loc.entity.properties.name || loc.entity.properties.number || 'Unnamed Location'
      L.marker([loc.lat, loc.lng])
        .addTo(map)
        .bindPopup(`
          <div style="color:#000;">
            <b>${name}</b><br/>
            Type: ${loc.entity.type}<br/>
            Confidence: ${loc.entity.confidence.toFixed(2)}
          </div>
        `)
    })

    mapInstance.current = map
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [entities])

  return (
    <div style={{ padding: '1rem', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ color: 'var(--accent)', marginTop: 0, marginBottom: '0.5rem' }}>GIS / Map Overlay View</h3>
      <div style={{ flex: 1, backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

// Subcomponent: 3D Earth Globe Mock
function ThreeDEarthMock() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      backgroundColor: 'var(--bg-base)',
      color: 'var(--text-secondary)',
      fontFamily: 'JetBrains Mono, monospace',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <svg width="240" height="240" viewBox="0 0 100 100" style={{ animation: 'spin 25s linear infinite' }}>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent)" strokeWidth="0.5" strokeDasharray="3 3" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="var(--accent)" strokeWidth="0.3" />
        <ellipse cx="50" cy="50" rx="40" ry="15" fill="none" stroke="var(--accent)" strokeWidth="0.5" strokeDasharray="5 5" />
        <ellipse cx="50" cy="50" rx="15" ry="40" fill="none" stroke="var(--accent)" strokeWidth="0.5" strokeDasharray="5 5" />
        <path d="M 10 50 Q 50 20 90 50 Q 50 80 10 50" fill="none" stroke="var(--accent)" strokeWidth="0.4" />
      </svg>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ marginTop: '2rem', textAlign: 'center', zIndex: 10 }}>
        <h3 style={{ color: 'var(--accent)', fontSize: '1.1rem', marginBottom: '0.5rem', letterSpacing: '0.15em' }}>3D SPATIAL INTEL GRID</h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phase 2 GIS Engine Integration (Coming Soon)</span>
      </div>
    </div>
  )
}

// Subcomponent: Report Preview & Editor
function ReportEditor({ caseId, apiBase }) {
  const [reportText, setReportText] = useState('# Intelligence Case Briefing\n\n## Executive Summary\n*Write or edit case findings here...*\n\n## Key Suspect Networks\n- ...')
  const [briefingTopic, setBriefingTopic] = useState('')
  const [generating, setGenerating] = useState(false)

  const handleGenerateBriefing = async () => {
    if (!briefingTopic.trim()) return
    try {
      setGenerating(true)
      const res = await fetch(`${apiBase}/api/v1/intelligence/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: briefingTopic })
      })
      if (res.ok) {
        const data = await res.json()
        setReportText(data.briefing)
      }
    } catch (err) {
      alert('Generation failed: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([reportText], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `case_briefing_${caseId}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="report-container">
      <div className="report-edit-pane">
        <h4 style={{ color: 'var(--accent)', margin: 0, fontSize: '0.85rem' }}>DRAFT BRIEFING WORKSPACE</h4>
        
        {/* RAG Briefing Gen Toolbar */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input 
            type="text" 
            placeholder="AI Briefing Topic (e.g. Transaction anomalies)"
            value={briefingTopic} 
            onChange={(e) => setBriefingTopic(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              color: 'white',
              outline: 'none'
            }}
          />
          <button 
            onClick={handleGenerateBriefing} 
            disabled={generating}
            style={{
              backgroundColor: 'var(--accent)',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.75rem',
              padding: '0 1rem',
              fontWeight: '600'
            }}
          >
            {generating ? 'Generating...' : 'AI Compose'}
          </button>
        </div>

        <textarea 
          value={reportText} 
          onChange={(e) => setReportText(e.target.value)}
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            padding: '12px',
            fontSize: '0.85rem',
            resize: 'none',
            outline: 'none'
          }}
        />
        <button 
          onClick={handleDownload}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--border-mid)',
            color: 'var(--text-primary)',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: '600',
            alignSelf: 'flex-start'
          }}
        >
          📥 Download Briefing (.md)
        </button>
      </div>
      
      {/* Markdown Simple Preview */}
      <div className="report-preview-pane">
        <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '1rem', letterSpacing: '0.05em' }}>REPORT PREVIEW</h4>
        <div style={{ whiteSpace: 'pre-wrap' }}>
          {reportText.split('\n').map((line, idx) => {
            if (line.startsWith('# ')) {
              return <h1 key={idx}>{line.slice(2)}</h1>
            } else if (line.startsWith('## ')) {
              return <h2 key={idx}>{line.slice(3)}</h2>
            } else if (line.startsWith('- ')) {
              return <li key={idx} style={{ marginLeft: '10px' }}>{line.slice(2)}</li>
            } else if (line.startsWith('> ')) {
              return <blockquote key={idx}>{line.slice(2)}</blockquote>
            }
            return <p key={idx} style={{ margin: '8px 0' }}>{line}</p>
          })}
        </div>
      </div>
    </div>
  )
}

export default function CaseWorkspace({ caseId, onBack, onSelectCase }) {
  const [caseDetails, setCaseDetails] = useState(null)
  const [graphData, setGraphData] = useState({ entities: [], relationships: [] })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('canvas') // canvas | map | earth | files | report
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [timelineDate, setTimelineDate] = useState(null)
  
  // All cases for switcher dropdown
  const [allCases, setAllCases] = useState([])

  // Document list
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)

  // Resizable Panels State
  const [leftWidth, setLeftWidth] = useState(() => parseInt(localStorage.getItem(`sentinel_left_${caseId}`) || '260'))
  const [rightWidth, setRightWidth] = useState(() => parseInt(localStorage.getItem(`sentinel_right_${caseId}`) || '360'))
  const [bottomHeight, setBottomHeight] = useState(() => parseInt(localStorage.getItem(`sentinel_bottom_${caseId}`) || '160'))

  const [leftVisible, setLeftVisible] = useState(true)
  const [rightVisible, setRightVisible] = useState(true)
  const [bottomVisible, setBottomVisible] = useState(true)

  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)
  const [isResizingBottom, setIsResizingBottom] = useState(false)

  // Command Palette State
  const [showCmdPalette, setShowCmdPalette] = useState(false)
  const [cmdSearch, setCmdSearch] = useState('')
  const [cmdResults, setCmdResults] = useState([])
  const [activeCmdIdx, setActiveCmdIdx] = useState(0)

  const apiBase = getApiBaseUrl()

  const loadCaseAndGraph = async () => {
    try {
      setLoading(true)
      // Get Case Details
      const caseRes = await fetch(`${apiBase}/api/v2/cases/${caseId}`)
      if (!caseRes.ok) throw new Error('Failed to load case details')
      const caseData = await caseRes.json()
      setCaseDetails(caseData)

      // Apply ui_state if present
      if (caseData.ui_state?.panel_layout) {
        const layout = caseData.ui_state.panel_layout
        if (layout.left?.size) setLeftWidth(layout.left.size)
        if (layout.left?.visible !== undefined) setLeftVisible(layout.left.visible)
        if (layout.right?.size) setRightWidth(layout.right.size)
        if (layout.right?.visible !== undefined) setRightVisible(layout.right.visible)
        if (layout.bottom?.size) setBottomHeight(layout.bottom.size)
        if (layout.bottom?.visible !== undefined) setBottomVisible(layout.bottom.visible)
      }

      // Get Graph Data
      const graphRes = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/`)
      if (!graphRes.ok) throw new Error('Failed to load graph data')
      const graphData = await graphRes.json()
      setGraphData(graphData)

      // Fetch Documents list
      fetchDocuments()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadActiveCases = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/`)
      if (res.ok) {
        const data = await res.json()
        setAllCases(data.filter(c => c.status !== 'deleted' && c.status !== 'archived'))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/memory/documents/status`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadCaseAndGraph()
    loadActiveCases()
  }, [caseId])

  // Auto-save UI state debounced on layout sizes or active tab change
  useEffect(() => {
    if (!caseDetails) return

    const timer = setTimeout(() => {
      saveUiStateToServer()
    }, 1000)

    return () => clearTimeout(timer)
  }, [leftWidth, leftVisible, rightWidth, rightVisible, bottomHeight, bottomVisible, activeTab])

  useEffect(() => {
    const hasIndexing = documents.some(doc => doc.status === 'indexing')
    if (hasIndexing) {
      const interval = setInterval(() => {
        fetchDocuments()
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [documents, caseId])

  // Dragging mousemove resize monitor
  useEffect(() => {
    if (!isResizingLeft && !isResizingRight && !isResizingBottom) return

    const handleMouseMove = (e) => {
      if (isResizingLeft) {
        const newWidth = Math.max(150, Math.min(500, e.clientX))
        setLeftWidth(newWidth)
      }
      if (isResizingRight) {
        const newWidth = Math.max(200, Math.min(600, window.innerWidth - e.clientX))
        setRightWidth(newWidth)
      }
      if (isResizingBottom) {
        const newHeight = Math.max(80, Math.min(350, window.innerHeight - e.clientY))
        setBottomHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      setIsResizingLeft(false)
      setIsResizingRight(false)
      setIsResizingBottom(false)
      
      localStorage.setItem(`sentinel_left_${caseId}`, leftWidth)
      localStorage.setItem(`sentinel_right_${caseId}`, rightWidth)
      localStorage.setItem(`sentinel_bottom_${caseId}`, bottomHeight)
      
      saveUiStateToServer()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingLeft, isResizingRight, isResizingBottom, leftWidth, rightWidth, bottomHeight])

  // Command Palette Keyboard shortcut registration
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCmdPalette(prev => !prev)
        setCmdSearch('')
        setActiveCmdIdx(0)
      }
    };
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Command Search logic
  useEffect(() => {
    if (!cmdSearch.trim()) {
      setCmdResults([
        { type: 'action', label: 'Toggle Theme', sub: 'Cycle through Light, Dark, and Ops Black themes', action: 'theme' },
        { type: 'action', label: 'Create New Graph Entity', sub: 'Asserts a new node directly to the canvas', action: 'entity' },
        { type: 'action', label: 'View Case Analytics Report', sub: 'Navigates to the Report tab', action: 'report' },
        { type: 'action', label: 'Trigger AI Research', sub: 'Prompts AI Planner Agent to research this Case', action: 'research' }
      ])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/memory/search?q=${encodeURIComponent(cmdSearch)}`)
        if (res.ok) {
          const data = await res.json()
          const items = data.map(chunk => ({
            type: 'rag',
            label: chunk.text_content.slice(0, 80) + '...',
            sub: `${chunk.document_name} · Page ${chunk.page_number} (Score: ${chunk.score.toFixed(2)})`,
            action: 'rag-chunk',
            text: chunk.text_content
          }))
          setCmdResults(items)
        }
      } catch (err) {
        console.error('CMD search error:', err)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [cmdSearch])

  const saveUiStateToServer = async () => {
    try {
      const newState = {
        panel_layout: {
          left: { size: leftWidth, visible: leftVisible },
          right: { size: rightWidth, visible: rightVisible },
          bottom: { size: bottomHeight, visible: bottomVisible }
        },
        open_tabs: [activeTab]
      }
      await fetch(`${apiBase}/api/v2/cases/${caseId}/ui_state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_state: newState })
      })
    } catch (err) {
      console.error(err)
    }
  }

  // Handle Command selection
  const executeCommand = (cmd) => {
    setShowCmdPalette(false)
    if (cmd.action === 'theme') {
      const event = new CustomEvent('themechange', { detail: 'ops-black' })
      const curr = document.documentElement.getAttribute('data-theme')
      const nextTheme = curr === 'dark' ? 'light' : curr === 'light' ? 'ops-black' : 'dark'
      document.documentElement.setAttribute('data-theme', nextTheme)
      localStorage.setItem('theme', nextTheme)
      window.dispatchEvent(new CustomEvent('themechange', { detail: nextTheme }))
    } else if (cmd.action === 'report') {
      setActiveTab('report')
    } else if (cmd.action === 'entity') {
      const name = prompt("Enter entity name:")
      const type = prompt("Enter entity type (e.g. person, location, account):")
      if (name && type) {
        handleAddEntity({ type, properties: { name }, confidence: 1.0 })
      }
    } else if (cmd.action === 'research') {
      alert("Focus set. Enter research goal in AI Copilot Chat panel.")
    } else if (cmd.action === 'rag-chunk') {
      alert(`Source Extract:\n\n"${cmd.text}"`)
    }
  }

  const handleCmdKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveCmdIdx(idx => (idx + 1) % cmdResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveCmdIdx(idx => (idx - 1 + cmdResults.length) % cmdResults.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (cmdResults[activeCmdIdx]) {
        executeCommand(cmdResults[activeCmdIdx])
      }
    } else if (e.key === 'Escape') {
      setShowCmdPalette(false)
    }
  }

  const handleUploadFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      setUploading(true)
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/memory/documents`, {
        method: 'POST',
        body: formData
      })
      if (!res.ok) throw new Error('File upload or indexing failed')
      fetchDocuments()
    } catch (err) {
      alert(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleAddEntity = async (entity) => {
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entity)
      })
      if (res.ok) {
        loadCaseAndGraph()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddRelationship = async (rel) => {
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rel)
      })
      if (res.ok) {
        loadCaseAndGraph()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddHypothesis = async (statement) => {
    try {
      const res = await fetch(`${apiBase}/api/v2/cases/${caseId}/graph/hypotheses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement, status: 'open', created_by: 'analyst' })
      })
      if (res.ok) {
        loadCaseAndGraph()
      }
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', height: '100vh', boxSizing: 'border-box', backgroundColor: 'var(--bg-base)' }}>
        <div className="skeleton" style={{ height: '44px', width: '100%' }} />
        <div style={{ display: 'flex', flex: 1, gap: '1rem' }}>
          <div className="skeleton" style={{ width: '260px' }} />
          <div className="skeleton" style={{ flex: 1 }} />
          <div className="skeleton" style={{ width: '360px' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="case-workspace" style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', overflow: 'hidden' }}>
      
      {/* Top Navigation */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-panel)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <button 
            onClick={onBack}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--border-mid)',
              color: 'var(--text-secondary)',
              padding: '0.4rem 0.8rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            ← Back
          </button>
          
          {/* Rapid Case Switcher dropdown */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <select 
              value={caseId} 
              onChange={(e) => {
                if (e.target.value === 'back') onBack()
                else onSelectCase(e.target.value)
              }}
              className="tb-select"
              style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 'bold' }}
            >
              {allCases.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Ontology: {caseDetails?.ontology_version}</span>
          </div>
        </div>

        {/* Command Palette Trigger Hint */}
        <div 
          onClick={() => setShowCmdPalette(true)}
          style={{
            cursor: 'pointer',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.4rem 1rem',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem'
          }}
        >
          <span>Search / Command Tool...</span>
          <kbd className="cmd-kbd-hint">Ctrl+K</kbd>
        </div>

        {/* View mode tabs */}
        <div style={{ display: 'flex', backgroundColor: 'var(--bg-base)', padding: '0.2rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
          {[
            { id: 'canvas', label: 'Canvas' },
            { id: 'map', label: '2D Map' },
            { id: 'earth', label: '3D Earth' },
            { id: 'files', label: 'Documents' },
            { id: 'report', label: 'Reports' },
            { id: 'resolutions', label: 'Resolutions' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                saveUiStateToServer()
              }}
              style={{
                border: 'none',
                backgroundColor: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'var(--text-muted)',
                padding: '0.4rem 0.8rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.8rem'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Resizable Layout Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* LEFT PANEL: Knowledge Graph mini-tree */}
        {leftVisible && (
          <div style={{ width: `${leftWidth}px`, borderRight: '1px solid var(--border)', backgroundColor: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
            <h4 style={{ padding: '1rem', margin: 0, borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.75rem' }}>
              Entity Inventory ({graphData.entities.length})
            </h4>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
              {graphData.entities.map((ent) => (
                <div 
                  key={ent.id}
                  onClick={() => setSelectedEntity(ent)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    marginBottom: '0.5rem',
                    borderRadius: '4px',
                    backgroundColor: selectedEntity?.id === ent.id ? 'var(--accent-sub)' : 'var(--bg-elevated)',
                    border: `1px solid ${selectedEntity?.id === ent.id ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{ent.properties.name || ent.properties.number || ent.properties.registration || 'Unnamed'}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', backgroundColor: 'var(--bg-panel)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                      {ent.type}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Confidence: {ent.confidence.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Left Resizer bar */}
        <div 
          className={`resizer-h ${isResizingLeft ? 'dragging' : ''}`}
          onMouseDown={() => setIsResizingLeft(true)}
        >
          <button 
            className="panel-toggle-btn left"
            onClick={(e) => { e.stopPropagation(); setLeftVisible(prev => !prev); }}
          >
            {leftVisible ? '‹' : '›'}
          </button>
        </div>

        {/* CENTER PANEL: Content Viewports */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-base)', overflow: 'hidden' }}>
          
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {activeTab === 'canvas' && (
              <ConnectionsBoard 
                graphData={graphData} 
                onSelectNode={setSelectedEntity}
                onAddRelationship={handleAddRelationship}
                timelineDate={timelineDate}
                onAddHypothesis={handleAddHypothesis}
              />
            )}
            
            {activeTab === 'map' && (
              <CaseMap entities={graphData.entities} />
            )}

            {activeTab === 'earth' && (
              <ThreeDEarthMock />
            )}
            
            {activeTab === 'files' && (
              <div style={{ padding: '2rem', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
                <h3 style={{ color: 'var(--accent)', marginTop: 0 }}>Case Permanent Memory Documents</h3>
                
                <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input 
                    type="file" 
                    id="file-upload" 
                    onChange={handleUploadFile}
                    style={{ display: 'none' }}
                    disabled={uploading}
                  />
                  <label 
                    htmlFor="file-upload"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '6px',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    {uploading ? 'Processing File...' : 'Upload Document'}
                  </label>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Supported formats: PDF, DOCX, TXT, MD, CSV, Images (OCR)</span>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  {documents.map((doc, idx) => {
                    const status = doc.status || 'completed'
                    const progress = doc.progress !== undefined ? doc.progress : 100.0
                    const message = doc.status_message || 'Indexed successfully'
                    
                    return (
                      <div 
                        key={idx} 
                        style={{
                          padding: '1.2rem',
                          backgroundColor: 'var(--bg-panel)',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{doc.document_name}</span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                              Scope: Case Memory vectors
                            </div>
                          </div>
                          
                          <div>
                            {status === 'completed' && (
                              <span style={{
                                fontSize: '0.8rem',
                                color: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontWeight: '600'
                              }}>
                                Indexed
                              </span>
                            )}
                            {status === 'indexing' && (
                              <span style={{
                                fontSize: '0.8rem',
                                color: 'var(--accent)',
                                backgroundColor: 'rgba(200, 129, 74, 0.1)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontWeight: '600'
                              }}>
                                Indexing ({progress.toFixed(0)}%)
                              </span>
                            )}
                            {status === 'failed' && (
                              <span style={{
                                fontSize: '0.8rem',
                                color: '#ef4444',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontWeight: '600'
                              }}>
                                Failed
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {status === 'indexing' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <span className="mono" style={{ color: 'var(--text-muted)' }}>{message}</span>
                              <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ 
                                  width: `${progress}%`, 
                                  height: '100%', 
                                  backgroundColor: 'var(--accent)', 
                                  borderRadius: '2px',
                                  transition: 'width 0.3s ease'
                                }} />
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: status === 'failed' ? '#ef4444' : 'var(--text-muted)' }}>
                              {message}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {activeTab === 'report' && (
              <ReportEditor caseId={caseId} apiBase={apiBase} />
            )}

            {activeTab === 'resolutions' && (
              <EntityResolutionManager caseId={caseId} apiBase={apiBase} onLoadGraph={loadCaseAndGraph} />
            )}
          </div>

          {/* Bottom Resizer bar */}
          {bottomVisible && (
            <div 
              className={`resizer-v ${isResizingBottom ? 'dragging' : ''}`}
              onMouseDown={() => setIsResizingBottom(true)}
            />
          )}

          {/* BOTTOM PANEL: Timeline */}
          {bottomVisible && (
            <div style={{ height: `${bottomHeight}px`, flexShrink: 0, backgroundColor: 'var(--bg-panel)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <TimelineSlider onDateChange={setTimelineDate} />
            </div>
          )}
        </div>

        {/* Right Resizer bar */}
        <div 
          className={`resizer-h ${isResizingRight ? 'dragging' : ''}`}
          onMouseDown={() => setIsResizingRight(true)}
        >
          <button 
            className="panel-toggle-btn right"
            onClick={(e) => { e.stopPropagation(); setRightVisible(prev => !prev); }}
          >
            {rightVisible ? '›' : '‹'}
          </button>
        </div>

        {/* RIGHT PANEL: AI Copilot Chat */}
        {rightVisible && (
          <div style={{ width: `${rightWidth}px`, borderLeft: '1px solid var(--border)', backgroundColor: 'var(--bg-panel)', display: 'flex', flexDirection: 'column' }}>
            <AICopilotChat caseId={caseId} onRefreshGraph={loadCaseAndGraph} />
          </div>
        )}
      </div>

      {/* Slide-out details drawer / panel */}
      {selectedEntity && (
        <CaseDetailsSidePanel 
          entity={selectedEntity} 
          caseId={caseId}
          onClose={() => setSelectedEntity(null)}
          onAddEntity={handleAddEntity}
          onRefresh={loadCaseAndGraph}
          relationships={graphData.relationships}
          entities={graphData.entities}
        />
      )}

      {/* COMMAND PALETTE DIALOG OVERLAY */}
      {showCmdPalette && (
        <div className="cmd-overlay" onClick={() => setShowCmdPalette(false)}>
          <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
            <div className="cmd-input-container">
              <span className="cmd-icon">🔍</span>
              <input 
                type="text" 
                className="cmd-input" 
                placeholder="Search case documents or choose a command..." 
                value={cmdSearch}
                onChange={(e) => { setCmdSearch(e.target.value); setActiveCmdIdx(0); }}
                onKeyDown={handleCmdKeyDown}
                autoFocus
              />
              <kbd className="cmd-kbd-hint">ESC</kbd>
            </div>
            
            <div className="cmd-list">
              {cmdResults.length === 0 ? (
                <div className="cmd-no-results">No actions or document chunks found.</div>
              ) : (
                cmdResults.map((cmd, idx) => (
                  <div 
                    key={idx} 
                    className={`cmd-item ${activeCmdIdx === idx ? 'active' : ''}`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setActiveCmdIdx(idx)}
                  >
                    <span className="cmd-item-icon">{cmd.type === 'action' ? '⚙️' : '📄'}</span>
                    <div className="cmd-item-info">
                      <span className="cmd-item-label">{cmd.label}</span>
                      <span className="cmd-item-sub">{cmd.sub}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
