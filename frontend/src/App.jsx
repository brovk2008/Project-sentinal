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
  
  const PageComponent = PAGES[page]

  return (
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
  )
}

