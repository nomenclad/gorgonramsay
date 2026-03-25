/**
 * Application entry point — mounts the React root in StrictMode.
 * The global stylesheet (index.css) includes Tailwind and all theme definitions.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
