import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Me } from './lib/api'

interface Ctx {
  me: Me | null
  setMe: (m: Me | null) => void
  toast: (msg: string, icon?: string) => void
  confetti: () => void
}

const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('AppCtx')
  return c
}

export function AppProvider({ initialMe, children }: { initialMe: Me | null; children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(initialMe)
  const [toastMsg, setToastMsg] = useState<{ msg: string; icon: string; k: number } | null>(null)
  const [burst, setBurst] = useState(0)

  const toast = useCallback((msg: string, icon = '✨') => setToastMsg({ msg, icon, k: Date.now() }), [])
  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), 4200)
    return () => clearTimeout(t)
  }, [toastMsg])

  const confetti = useCallback(() => setBurst(Date.now()), [])
  useEffect(() => {
    if (!burst) return
    const t = setTimeout(() => setBurst(0), 2000)
    return () => clearTimeout(t)
  }, [burst])

  return (
    <AppCtx.Provider value={{ me, setMe, toast, confetti }}>
      {children}
      {toastMsg && (
        <div className="toast" role="status" key={toastMsg.k} onClick={() => setToastMsg(null)}>
          <span className="ic">{toastMsg.icon}</span>
          <span>{toastMsg.msg}</span>
        </div>
      )}
      {burst > 0 && (
        <div className="confetti" aria-hidden>
          {Array.from({ length: 26 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.08}s` }}>
              {['🎉', '✨', '💜', '💙', '⭐'][i % 5]}
            </i>
          ))}
        </div>
      )}
    </AppCtx.Provider>
  )
}

/** Učitava podatke; reload() ponovo učitava. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const reload = useCallback(
    () =>
      loadRef.current().then(
        (d) => {
          setData(d)
          setError(null)
        },
        (e: Error) => setError(e.message),
      ),
    [],
  )
  useEffect(() => {
    void reload()
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload, setData }
}
