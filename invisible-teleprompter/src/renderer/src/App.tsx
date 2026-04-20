import { HashRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import Teleprompter from './components/Teleprompter'
import Overlay from './components/Overlay'
import History from './components/History'
import Settings from './components/Settings'

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/teleprompter" element={<Teleprompter />} />
        <Route path="/overlay" element={<Overlay />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  )
}

export default App
