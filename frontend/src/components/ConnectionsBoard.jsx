import React, { useState, useRef, useEffect } from 'react'

const parseTimelineDate = (str) => {
  if (!str) return null
  const cleaned = str.replace(' (Live)', '')
  const parts = cleaned.split(' ')
  if (parts.length !== 2) return null
  const months = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
  }
  const monthNum = months[parts[0]]
  const yearNum = parseInt(parts[1])
  if (!monthNum || isNaN(yearNum)) return null
  return { year: yearNum, month: monthNum }
}

const isDateBeforeTimeline = (dateStr, limit) => {
  if (!dateStr || !limit) return true
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return true
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    
    if (year < limit.year) return true
    if (year > limit.year) return false
    return month <= limit.month
  } catch (e) {
    return true
  }
}

export default function ConnectionsBoard({ graphData, onSelectNode, onAddRelationship, timelineDate, onAddHypothesis }) {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [contextMenu, setContextMenu] = useState(null)
  
  // Transform scale and pan coordinates
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1.0)
  
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  
  const [draggedNode, setDraggedNode] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Relationship drawing states
  const [drawingFromNode, setDrawingFromNode] = useState(null)
  const [tempEdgeEnd, setTempEdgeEnd] = useState({ x: 0, y: 0 })

  // Phase 2: Hover Tooltip details
  const [hoveredElement, setHoveredElement] = useState(null)

  const svgRef = useRef(null)

  // Initialize node layout positions deterministically
  useEffect(() => {
    if (graphData.entities) {
      const formattedNodes = graphData.entities.map((node, index) => {
        // Arrange nodes in a neat radial circle on initial load
        const angle = (index / (graphData.entities.length || 1)) * 2 * Math.PI
        const radius = 180 + (index % 2) * 50
        const defaultX = 400 + radius * Math.cos(angle)
        const defaultY = 300 + radius * Math.sin(angle)
        
        return {
          ...node,
          x: node.location?.x || defaultX,
          y: node.location?.y || defaultY
        }
      })
      setNodes(formattedNodes)
    }

    if (graphData.relationships) {
      setEdges(graphData.relationships)
    }
  }, [graphData])

  const handleMouseDown = (e) => {
    setContextMenu(null)
    // Left click on background triggers panning
    if (e.target.tagName === 'svg' || e.target.id === 'bg') {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    
    // Get mouse coordinates in screen space relative to SVG
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top

    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
    } else if (draggedNode !== null) {
      // Move dragged node (convert delta to canvas coordinates)
      const canvasX = (clientX - pan.x) / zoom
      const canvasY = (clientY - pan.y) / zoom
      setNodes(prev => prev.map(n => n.id === draggedNode ? { ...n, x: canvasX, y: canvasY } : n))
    } else if (drawingFromNode) {
      // Update temp relationship endpoint
      const canvasX = (clientX - pan.x) / zoom
      const canvasY = (clientY - pan.y) / zoom
      setTempEdgeEnd({ x: canvasX, y: canvasY })
    }
  }

  const handleMouseUp = (e) => {
    setIsPanning(false)
    setDraggedNode(null)
    
    if (drawingFromNode) {
      // Reset temp edge
      setDrawingFromNode(null)
    }
  }

  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    
    if (e.shiftKey) {
      // Shift+Click starts drawing relationship link
      setDrawingFromNode(nodeId)
      setTempEdgeEnd({ x: node.x, y: node.y })
    } else {
      // Drag node
      setDraggedNode(nodeId)
      onSelectNode(node)
    }
  }

  const handleNodeMouseUp = (e, nodeId) => {
    e.stopPropagation()
    if (drawingFromNode && drawingFromNode !== nodeId) {
      // Drawing completed -> trigger relationship creation
      const relType = prompt("Enter relationship type (e.g. called, seen_with, family_member_of):")
      if (relType) {
        onAddRelationship({
          source_entity_id: drawingFromNode,
          target_entity_id: nodeId,
          relationship_type: relType,
          label: relType.replace('_', ' '),
          confidence: 1.0
        })
      }
    }
    setDrawingFromNode(null)
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const zoomFactor = 1.05
    if (e.deltaY < 0) {
      setZoom(z => Math.min(z * zoomFactor, 2.5))
    } else {
      setZoom(z => Math.max(z / zoomFactor, 0.4))
    }
  }

  // Node Hover Triggers
  const handleNodeMouseEnter = (e, node) => {
    const rect = svgRef.current.getBoundingClientRect()
    setHoveredElement({
      type: 'node',
      id: node.id,
      name: node.properties.name || node.properties.number || node.properties.registration || 'Entity',
      nodeType: node.type,
      confidence: node.confidence,
      source: node.source || 'Manual/Evidence',
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }

  // Edge Hover Triggers
  const handleEdgeMouseEnter = (e, edge) => {
    const rect = svgRef.current.getBoundingClientRect()
    setHoveredElement({
      type: 'edge',
      id: edge.id,
      label: edge.label,
      confidence: edge.confidence,
      evidence: edge.evidence || 'Direct asserted connection',
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }

  const handleMouseLeave = () => {
    setHoveredElement(null)
  }

  // Draw node coordinates mappings
  const nodeCoords = nodes.reduce((acc, n) => {
    acc[n.id] = { x: n.x, y: n.y }
    return acc
  }, {})

  const timelineLimit = parseTimelineDate(timelineDate)

  const visibleNodes = nodes.filter(node => {
    return isDateBeforeTimeline(node.created_at || node.properties.fir_date, timelineLimit)
  })

  const visibleNodeIds = new Set(visibleNodes.map(n => n.id))

  const visibleEdges = edges.filter(edge => {
    const fromVisible = visibleNodeIds.has(edge.source_entity_id)
    const toVisible = visibleNodeIds.has(edge.target_entity_id)
    const dateVisible = isDateBeforeTimeline(edge.created_at || edge.last_updated, timelineLimit)
    return fromVisible && toVisible && dateVisible
  })

  return (
    <div style={{ height: '100%', width: '100%', overflow: 'hidden', userSelect: 'none', position: 'relative' }}>
      
      {/* HUD control guide overlay */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '0.75rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        pointerEvents: 'none',
        zIndex: 10
      }}>
        <div style={{ fontWeight: '600', color: 'var(--accent)', marginBottom: '0.25rem' }}>CANVAS CONTROL HUD</div>
        <div>🖱️ Drag background to Pan</div>
        <div>📜 Scroll to Zoom</div>
        <div>🔴 Click node to Select / Inspect</div>
        <div>⛓️ Shift + Drag node to draw Relationship</div>
      </div>

      <svg 
        ref={svgRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({
            x: e.clientX - e.currentTarget.getBoundingClientRect().left,
            y: e.clientY - e.currentTarget.getBoundingClientRect().top,
            type: 'canvas'
          })
        }}
        style={{ width: '100%', height: '100%', backgroundColor: 'var(--bg-base)', cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <rect id="bg" width="100%" height="100%" fill="transparent" />

        {/* Outer Group supporting Zoom & Pan transformation matrix */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          
          {/* Defined glow filters & markers */}
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            
            <marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-mid)" />
            </marker>
            <marker id="arrow-selected" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* Draw relationships (Edges) */}
          {visibleEdges.map((edge) => {
            const start = nodeCoords[edge.source_entity_id]
            const end = nodeCoords[edge.target_entity_id]
            
            if (!start || !end) return null
            
            const isAIEdge = edge.created_by === 'AI Planner Agent' || edge.source === 'AI Planner Agent'
            
            return (
              <g 
                key={edge.id}
                onMouseEnter={(e) => handleEdgeMouseEnter(e, edge)}
                onMouseLeave={handleMouseLeave}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectNode(edge)
                }}
                style={{ cursor: 'pointer' }}
              >
                <line 
                  x1={start.x} 
                  y1={start.y} 
                  x2={end.x} 
                  y2={end.y} 
                  stroke={isAIEdge ? 'var(--accent)' : 'var(--border-mid)'}
                  strokeWidth="2.5"
                  strokeDasharray={isAIEdge ? '4 4' : 'none'}
                  markerEnd="url(#arrow)"
                  opacity={isAIEdge ? '0.7' : '1.0'}
                  style={{ transition: 'stroke-width 0.1s' }}
                />
                {/* Edge Label */}
                <text 
                  x={(start.x + end.x) / 2} 
                  y={(start.y + end.y) / 2 - 4} 
                  fill="var(--text-muted)"
                  fontSize="9px"
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              </g>
            )
          })}

          {/* Temp drawing relationship link line */}
          {drawingFromNode && nodeCoords[drawingFromNode] && (
            <line 
              x1={nodeCoords[drawingFromNode].x} 
              y1={nodeCoords[drawingFromNode].y} 
              x2={tempEdgeEnd.x} 
              y2={tempEdgeEnd.y} 
              stroke="var(--accent)" 
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          )}

          {/* Draw entity nodes */}
          {visibleNodes.map((node) => {
            const isHypothesis = node.type === 'Hypothesis'
            const isAIProposed = node.created_by === 'AI Planner Agent' || node.source === 'AI Planner Agent'
            
            return (
              <g 
                key={node.id} 
                transform={`translate(${node.x}, ${node.y})`}
                onMouseDown={(e) => { setContextMenu(null); handleNodeMouseDown(e, node.id); }}
                onMouseUp={(e) => handleNodeMouseUp(e, node.id)}
                onMouseEnter={(e) => handleNodeMouseEnter(e, node)}
                onMouseLeave={handleMouseLeave}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const rect = svgRef.current.getBoundingClientRect()
                  setContextMenu({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    type: 'node',
                    targetId: node.id
                  })
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* Shape rendering: Diamond for Hypotheses, Rectangle/Circle for entities */}
                {isHypothesis ? (
                  <polygon 
                    points="0,-25 25,0 0,25 -25,0"
                    fill="var(--bg-elevated)"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    filter="url(#glow)"
                  />
                ) : (
                  <rect 
                    x="-50" 
                    y="-20" 
                    width="100" 
                    height="40" 
                    rx={isAIProposed ? '0' : '6'} 
                    fill="var(--bg-panel)"
                    stroke={isAIProposed ? 'var(--accent)' : 'var(--border-mid)'}
                    strokeWidth={isAIProposed ? '2' : '1.5'}
                    strokeDasharray={isAIProposed ? '4 4' : 'none'}
                    filter="url(#glow)"
                    opacity={isAIProposed ? '0.85' : '1.0'}
                  />
                )}

                {/* Node Label Text */}
                <text 
                  y="4"
                  fill="var(--text-primary)" 
                  fontSize="11px" 
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {node.properties.name || node.properties.number || node.properties.registration || 'Entity'}
                </text>

                {/* Micro badge indicating AI suggestions */}
                {isAIProposed && (
                  <g transform="translate(38, -14)">
                    <rect x="-10" y="-6" width="20" height="12" rx="3" fill="var(--accent)" />
                    <text fill="white" fontSize="7px" fontWeight="800" textAnchor="middle" y="3.5">AI</text>
                  </g>
                )}
              </g>
            )
          })}

        </g>
      </svg>

      {/* Floating Hover Tooltip Detail Overlay */}
      {hoveredElement && (
        <div 
          style={{
            position: 'absolute',
            top: hoveredElement.y + 15,
            left: hoveredElement.x + 15,
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--accent)',
            borderRadius: '4px',
            padding: '8px 12px',
            pointerEvents: 'none',
            zIndex: 1000,
            fontSize: '0.75rem',
            color: 'var(--text-primary)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            minWidth: '150px'
          }}
        >
          {hoveredElement.type === 'node' ? (
            <>
              <div style={{ fontWeight: 'bold', color: 'var(--accent)', marginBottom: '0.25rem' }}>{hoveredElement.name}</div>
              <div>Type: {hoveredElement.nodeType}</div>
              <div>Confidence: <span className="mono">{(hoveredElement.confidence ?? 1.0).toFixed(2)}</span></div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Source: {hoveredElement.source}</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 'bold', color: 'var(--accent)', marginBottom: '0.25rem' }}>{hoveredElement.label}</div>
              <div>Link Type: Relationship</div>
              <div>Confidence: <span className="mono">{(hoveredElement.confidence ?? 1.0).toFixed(2)}</span></div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Evidence: {hoveredElement.evidence}</div>
            </>
          )}
        </div>
      )}

      {contextMenu && (
        <div 
          style={{
            position: 'absolute',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--accent)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            padding: '4px 0',
            zIndex: 1000,
            minWidth: '150px'
          }}
          onClick={() => setContextMenu(null)}
        >
          {contextMenu.type === 'canvas' ? (
            <button
              onClick={() => {
                const statement = prompt("Enter hypothesis statement:")
                if (statement) {
                  onAddHypothesis(statement)
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent-sub)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              ➕ Create Hypothesis
            </button>
          ) : (
            <button
              onClick={() => {
                const node = nodes.find(n => n.id === contextMenu.targetId)
                const defaultStmt = node ? (node.properties.name || node.properties.number || node.properties.registration || '') : ''
                const statement = prompt("Enter hypothesis statement:", defaultStmt)
                if (statement) {
                  onAddHypothesis(statement)
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent-sub)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              🔶 Mark as Hypothesis
            </button>
          )}
        </div>
      )}
    </div>
  )
}
