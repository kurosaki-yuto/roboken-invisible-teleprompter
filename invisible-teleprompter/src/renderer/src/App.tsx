import React from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Overlay from './pages/Overlay'
import Teleprompter from './pages/Teleprompter'
import History from './pages/History'
import Settings from './pages/Settings'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/overlay" element={<Overlay />} />
        <Route path="/teleprompter" element={<Teleprompter />} />
      </Routes>
    </HashRouter>
  )
}
