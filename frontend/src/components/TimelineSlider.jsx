import React, { useState } from 'react'

export default function TimelineSlider({ onDateChange }) {
  const [val, setVal] = useState(100)
  const steps = [
    "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026 (Live)"
  ]

  const handleChange = (e) => {
    const newVal = parseInt(e.target.value)
    setVal(newVal)
    
    // Fire callback
    const dateIdx = Math.round((newVal / 100) * (steps.length - 1))
    onDateChange && onDateChange(steps[dateIdx])
  }

  return (
    <div style={{
      padding: '0.75rem 1.5rem',
      backgroundColor: '#111827',
      borderTop: '1px solid #1f2937',
      display: 'flex',
      alignItems: 'center',
      gap: '1.5rem',
      zIndex: 5
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: '100px' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#c8814a' }}>CASE TIMELINE</span>
        <span style={{ fontSize: '0.8rem', color: '#e5e7eb', fontWeight: 'bold' }}>{steps[Math.round((val / 100) * (steps.length - 1))]}</span>
      </div>

      <input 
        type="range" 
        min="0" 
        max="100" 
        value={val} 
        onChange={handleChange}
        style={{
          flex: 1,
          accentColor: '#c8814a',
          cursor: 'pointer',
          height: '4px',
          borderRadius: '2px',
          backgroundColor: '#374151'
        }}
      />
      
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#9ca3af' }}>
        <span>Playhead filters map & canvas events</span>
      </div>
    </div>
  )
}
