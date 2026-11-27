import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-ext-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-ext-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-ext-600.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-ext-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-ext-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import '@fontsource/plus-jakarta-sans/latin-ext-800.css'
import './styles.css'
import App from './App'
import { AppProvider } from './state'
import { loadMe, type Me } from './lib/api'

// v1 je imao service worker (offline režim). Odjavi ga i obriši njegov keš,
// da stari telefoni ne bi zauvijek prikazivali staru verziju.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => {})
}
if ('caches' in window) {
  void caches
    .keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ce-')).map((k) => caches.delete(k))))
    .catch(() => {})
}

const root = createRoot(document.getElementById('root')!)

async function boot() {
  // Platno ne treba nalog; ostali ekrani učitavaju sačuvanu sesiju.
  const isScreen = location.hash.startsWith('#/platno')
  let me: Me | null = null
  if (!isScreen) me = await loadMe().catch(() => null)
  root.render(
    <StrictMode>
      <AppProvider initialMe={me}>
        <App />
      </AppProvider>
    </StrictMode>,
  )
}
void boot()
