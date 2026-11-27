// /#/platno — veliki ekran u sali (1920×1080). Javno, bez prijave.
// Samo zbirni brojevi, timovi i nikovi na zidu. Uživo preko Realtime-a (tabela demo_events),
// uz rezervno osvježavanje ako websocket ne radi.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { APP, tagIcon } from '../config/demo'
import { rpc, watchWall, type Screen } from '../lib/api'
import { fmtAgo } from '../lib/format'

const logo = `${import.meta.env.BASE_URL}logo.png`

export function joinUrl(izvor: string | null) {
  const base = `${location.origin}${location.pathname}#/`
  return izvor === 'stand' ? `${base}?izvor=stand` : base
}

export function Platno() {
  const [params] = useSearchParams()
  const izvor = params.get('izvor')
  const url = joinUrl(izvor)
  const [s, setS] = useState<Screen | null>(null)
  const [live, setLive] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [qr, setQr] = useState('')
  const [, tick] = useState(0)
  const seen = useRef<Set<number> | null>(null)
  const timer = useRef<number | null>(null)

  const load = useCallback(() => {
    rpc<Screen>('get_screen').then(
      (d) => {
        setS(d)
        setErr(null)
      },
      (e: Error) => setErr(e.message),
    )
  }, [])

  // Mnogo događaja odjednom → najviše jedno učitavanje u ~0,7 s.
  const soon = useCallback(() => {
    if (timer.current) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      load()
    }, 700)
  }, [load])

  useEffect(() => {
    load()
    return watchWall(soon, setLive)
  }, [load, soon])

  useEffect(() => {
    const t = setInterval(load, live ? 15_000 : 4_000)
    return () => clearInterval(t)
  }, [live, load])

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 20_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1B1446', light: '#FFFFFF' } }).then(setQr, () => setQr(''))
  }, [url])

  const fresh = (id: number) => seen.current !== null && !seen.current.has(id)
  useEffect(() => {
    if (!s) return
    const ids = new Set(s.wall.map((w) => w.id))
    const t = setTimeout(() => {
      seen.current = ids
    }, 1200)
    return () => clearTimeout(t)
  }, [s])

  const max = Math.max(1, ...(s?.teams.map((t) => t.members) ?? [1]))
  return (
    <div className="screen" data-testid="screen">
      <aside className="screen-left">
        <img src={logo} alt={APP.name} className="screen-logo" />
        <h1 className="screen-slogan">{APP.slogan}</h1>
        <div className="qr" aria-label="QR kod za ulaz" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="screen-url" data-testid="screen-url">{url.replace(/^https?:\/\//, '')}</p>
        {s && !s.registrations_open && <p className="screen-closed" data-testid="screen-closed">Prijave su zatvorene</p>}
      </aside>

      <main className="screen-mid">
        <div className="counters">
          <div className="counter">
            <b data-testid="screen-people">{s?.people ?? 0}</b>
            <span>učesnika</span>
          </div>
          <div className="counter accent">
            <b data-testid="screen-joined">{s?.joined ?? 0}</b>
            <span>u timovima</span>
          </div>
        </div>
        <div className="bars">
          {s?.teams.map((t) => (
            <div key={t.id} className={`bar ${t.is_fallback ? 'fallback' : ''}`} data-testid="screen-team">
              <span className="bi">{tagIcon(t.tag)}</span>
              <span className="bt">{t.title}</span>
              <span className="bb"><i style={{ width: `${(t.members / max) * 100}%` }} /></span>
              <b className="bn">{t.members}</b>
            </div>
          ))}
        </div>
      </main>

      <section className="screen-wall" aria-live="polite">
        <h2>
          Uživo <span className={`live-dot ${live ? 'on' : ''}`} title={live ? 'Realtime' : 'Osvježavanje'} />
        </h2>
        {err && <p className="screen-err">{err}</p>}
        {s?.wall.length === 0 && <p className="screen-empty">Skeniraj kod i budi prvi/a na zidu.</p>}
        <ul>
          {s?.wall.slice(0, 14).map((w) => (
            <li key={w.id} className={fresh(w.id) ? 'fresh' : ''} data-testid="wall-item">
              <b>{w.nick}</b> {w.text}
              <span className="ago">{fmtAgo(w.at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
