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
}

export default function App() {
  const [page, setPage] = useState('heatmap')
  const PageComponent = PAGES[page]

  return (
    <div className="app-layout">
      <Sidebar active={page} onNavigate={setPage} />
      <div className="main-content">
        <PageComponent />
      </div>
    </div>
  )
}
