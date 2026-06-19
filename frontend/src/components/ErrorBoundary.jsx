import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          background: 'var(--bg-panel, #1e1e24)',
          border: '1px solid var(--critical, #ef4444)',
          borderRadius: '4px',
          margin: '20px',
          color: 'var(--text-primary, #ffffff)',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <h2 style={{ color: 'var(--critical, #ef4444)', fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>
            System Error: Component Crashed
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #a1a1a6)', marginBottom: '16px' }}>
            {this.props.errorMessage || 'An error occurred while rendering this interface.'}
          </p>
          <pre style={{
            background: 'var(--bg-primary, #0f0f12)',
            padding: '12px',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'JetBrains Mono, monospace',
            overflowX: 'auto',
            color: 'var(--text-dim, #787880)'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: 'var(--bg-card, #2c2c35)',
              border: '1px solid var(--border, #3a3a45)',
              color: 'var(--text-primary, #ffffff)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            Retry Render
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
