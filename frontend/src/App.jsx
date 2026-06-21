import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import CrimeHeatmap from './pages/CrimeHeatmap.jsx'
import CrimeTrends from './pages/CrimeTrends.jsx'
import DistrictDrilldown from './pages/DistrictDrilldown.jsx'
import NetworkAnalysis from './pages/NetworkAnalysis.jsx'
import AIForecasting from './pages/AIForecasting.jsx'
import AIHotspots from './pages/AIHotspots.jsx'
import AINetworkRisk from './pages/AINetworkRisk.jsx'
import AICrimePatterns from './pages/AICrimePatterns.jsx'
import AIAnomalies from './pages/AIAnomalies.jsx'
import IntelligenceAssistant from './pages/IntelligenceAssistant.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import CaseList from './pages/CaseList.jsx'
import CaseWorkspace from './pages/CaseWorkspace.jsx'
import Admin from './pages/Admin.jsx'

const PAGES = {
  heatmap:      CrimeHeatmap,
  trends:       CrimeTrends,
  districts:    DistrictDrilldown,
  network:      NetworkAnalysis,
  'ai-forecast':  AIForecasting,
  'ai-hotspots':  AIHotspots,
  'ai-network':   AINetworkRisk,
  'ai-patterns':  AICrimePatterns,
  'ai-anomalies': AIAnomalies,
  'ai-assistant': IntelligenceAssistant,
  admin:        Admin,
}

export default function App() {
  const [page, setPage] = useState('cases')
  const [activeCaseId, setActiveCaseId] = useState(null)
  const [showSplash, setShowSplash] = useState(true)
  
  const PageComponent = PAGES[page]

  return (
    <>
      {showSplash && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: '#050507',
          zIndex: 99999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden'
        }}>
          {/* Background Video */}
          <video 
            src="/Startup vid.mp4" 
            autoPlay 
            muted 
            playsInline 
            onEnded={() => setShowSplash(false)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.35,
              zIndex: 1
            }}
          />

          {/* Futuristic Overlay Grid */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(to bottom, rgba(5, 5, 7, 0.4), rgba(5, 5, 7, 0.85))',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: '#efefef',
            fontFamily: 'Inter, sans-serif',
            textAlign: 'center',
            padding: '1rem',
            boxSizing: 'border-box'
          }}>
            {/* Logo */}
            <img 
              src="/logo.png" 
              style={{
                width: '110px',
                height: '110px',
                objectFit: 'contain',
                marginBottom: '1.5rem',
                filter: 'drop-shadow(0 0 20px rgba(200, 129, 74, 0.65))'
              }} 
              alt="Project Sentinel Brand Logo" 
            />

            {/* Title */}
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              letterSpacing: '0.25em',
              margin: '0 0 0.5rem 0',
              color: '#ffffff',
              textTransform: 'uppercase',
              textShadow: '0 0 10px rgba(255,255,255,0.2)'
            }}>
              Sentinel
            </h1>
            <p style={{
              fontSize: '0.9rem',
              letterSpacing: '0.4em',
              color: '#c8814a',
              margin: '0 0 2rem 0',
              textTransform: 'uppercase',
              fontWeight: 500
            }}>
              Crime Intelligence Command Center
            </p>

            {/* Futuristic boot diagnostics logs */}
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.45)',
              lineHeight: '1.8',
              textAlign: 'left',
              width: '100%',
              maxWidth: '380px',
              backgroundColor: 'rgba(15, 16, 17, 0.75)',
              padding: '1.25rem 1.5rem',
              borderRadius: '6px',
              border: '1px solid rgba(200, 129, 74, 0.25)',
              backdropFilter: 'blur(8px)',
              boxSizing: 'border-box'
            }}>
              <div style={{ color: '#c8814a' }}>{">"} COGNITIVE CORE BOOT_LINK: SUCCESS</div>
              <div>{">"} DECRYPTING 1.67M STATE FIR DATABASE...</div>
              <div>{">"} SYNCHRONIZING MULTI-HOP FRAUD PATTERNS...</div>
              <div>{">"} ZERO TRUST API SECURITY SHIELD: ENFORCED</div>
            </div>

            {/* Interactive button */}
            <button 
              onClick={() => setShowSplash(false)}
              style={{
                marginTop: '2.5rem',
                padding: '0.8rem 2.2rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                letterSpacing: '0.2em',
                color: '#ffffff',
                backgroundColor: 'rgba(200, 129, 74, 0.15)',
                border: '1.5px solid #c8814a',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 0 15px rgba(200, 129, 74, 0.25)',
                backdropFilter: 'blur(4px)',
                textTransform: 'uppercase'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#c8814a';
                e.target.style.boxShadow = '0 0 25px rgba(200, 129, 74, 0.65)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'rgba(200, 129, 74, 0.15)';
                e.target.style.boxShadow = '0 0 15px rgba(200, 129, 74, 0.25)';
              }}
            >
              Enter Command Center
            </button>
          </div>
        </div>
      )}
      <div className="app">
        <Sidebar active={page === 'workspace' ? 'cases' : page} onNavigate={setPage} />
        <div className="main">
          {page === 'cases' ? (
            <CaseList onSelectCase={(id) => {
              setActiveCaseId(id)
              setPage('workspace')
            }} />
          ) : page === 'workspace' ? (
            <CaseWorkspace 
              caseId={activeCaseId} 
              onBack={() => setPage('cases')} 
              onSelectCase={setActiveCaseId}
            />
          ) : page === 'ai-assistant' || page === 'ai-patterns' ? (
            <ErrorBoundary errorMessage={`${page === 'ai-assistant' ? 'Intelligence Assistant' : 'Crime Patterns'} page encountered a rendering issue.`}>
              <PageComponent />
            </ErrorBoundary>
          ) : (
            <PageComponent />
          )}
        </div>
      </div>
    </>
  )
}

