import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Workspace from './pages/Workspace'
import Report from './pages/Report'
import { TourLayer } from './components/TourLayer'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/c/:id" element={<Workspace />} />
        <Route path="/r/:id" element={<Report />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <TourLayer />
    </BrowserRouter>
  </React.StrictMode>,
)
