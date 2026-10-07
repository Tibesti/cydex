import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initPwa } from './lib/pwa'

// Service worker + install prompt (installable app)
initPwa()

createRoot(document.getElementById("root")!).render(<App />);
