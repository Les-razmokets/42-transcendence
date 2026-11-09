import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/monoton'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import './design-system/tokens/tokens.css'
import './lib/i18n.ts';
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
