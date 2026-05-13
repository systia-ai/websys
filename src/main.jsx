import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './setPublicAssetsBase.js'
import './index.css'
import App from './App.jsx'
import EtiquetaPublica from './EtiquetaPublica.jsx'

export function Root() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/etiqueta" element={<EtiquetaPublica />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </HashRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
