// /#/ — ulaz → nik → interesovanja → poziv → „Za tebe“.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../state'
import { APP, parseSource } from '../config/demo'
import { enter, rpc, type Invite, type Me } from '../lib/api'
import { CodeDialog, InviteCard, TagPicker, tagsOk } from '../components/bits'
import { Icon } from '../components/Icon'
import { ForYou } from './ForYou'

const logo = `${import.meta.env.BASE_URL}logo.png`
const SOURCE_KEY = 'ce-izvor'

function rememberedSource(): string {
  try {
    return parseSource(sessionStorage.getItem(SOURCE_KEY))
  } catch {
    return 'finale'
  }
}

export function Entry() {
  const { me } = useApp()
  const [params] = useSearchParams()
  const [reveal, setReveal] = useState<Invite | null | undefined>(undefined)

  useEffect(() => {
    const v = params.get('izvor')
    if (v) {
      try {
        sessionStorage.setItem(SOURCE_KEY, parseSource(v))
      } catch {
        /* ignore */
      }
    }
  }, [params])

  if (!me) return <Landing />
  if (me.role === 'mentor') return <Navigate to="/admin" replace />
  if (!me.nick) return <NickStep />
  if (me.tags.length === 0) return <InterestsStep onDone={setReveal} />
  if (reveal) return <Reveal inv={reveal} onClose={() => setReveal(undefined)} />
  return <ForYou />
}

function Landing() {
  const { setMe } = useApp()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [code, setCode] = useState(false)
  return (
    <div className="page center" style={{ gap: 20 }}>
      <img className="hero-logo" src={logo} alt={APP.name} />
      <div style={{ textAlign: 'center' }}>
        <h1 className="grad-text" style={{ fontSize: 32 }}>{APP.slogan}</h1>
        <p className="muted" style={{ marginTop: 10 }}>Izaberi šta te zanima i za 30 sekundi dobij poziv u tim.</p>
      </div>
      {err && <div className="error-box" data-testid="enter-error">{err}</div>}
      <button
        className="btn block big"
        data-testid="enter"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setErr(null)
          try {
            setMe(await enter(rememberedSource()))
          } catch (e) {
            setErr((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Trenutak…' : 'Uđi'}
      </button>
      <p className="tiny" style={{ textAlign: 'center' }}>
        Bez imena, emaila i lozinke. <span className="demo-pill">Demo</span>
      </p>
      <button className="link-btn" onClick={() => setCode(true)} data-testid="have-code">Imam kod</button>
      {code && <CodeDialog hasAccount={false} onClose={() => setCode(false)} onDone={(m) => setMe(m)} />}
    </div>
  )
}

export function NickChooser({ onChosen, current }: { onChosen: (me: Me) => void; current?: string | null }) {
  const [nicks, setNicks] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = () =>
    rpc<string[]>('suggest_nicks').then(setNicks, (e: Error) => setErr(e.message))
  useEffect(() => {
    void load()
  }, [])
  return (
    <div className="stack">
      <div className="nick-grid" data-testid="nicks">
        {nicks.length === 0 && !err && <div className="spinner" />}
        {nicks.map((n) => (
          <button
            key={n}
            className={`nick ${n === current ? 'on' : ''}`}
            disabled={busy}
            data-testid="nick-option"
            onClick={async () => {
              setBusy(true)
              setErr(null)
              try {
                onChosen(await rpc<Me>('set_nick', { p_nick: n }))
              } catch (e) {
                setErr((e as Error).message)
                void load()
              } finally {
                setBusy(false)
              }
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {err && <div className="error-box">{err}</div>}
      <button className="btn ghost small" style={{ alignSelf: 'center' }} disabled={busy} onClick={() => void load()} data-testid="more-nicks">
        <Icon name="refresh" size={16} /> Druga imena
      </button>
    </div>
  )
}

function NickStep() {
  const { setMe } = useApp()
  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <Steps at={1} />
      <h1>Izaberi svoje ime</h1>
      <p className="muted">Ovo ime vide ostali u timu i na platnu.</p>
      <NickChooser onChosen={setMe} />
    </div>
  )
}

function InterestsStep({ onDone }: { onDone: (inv: Invite | null) => void }) {
  const { me, setMe } = useApp()
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <Steps at={2} />
      <h1>Šta te zanima?</h1>
      <p className="muted">
        Zdravo, <b>{me?.nick}</b>! Izaberi od 1 do 4.
      </p>
      <TagPicker value={sel} onChange={setSel} />
      {err && <div className="error-box">{err}</div>}
      <button
        className="btn block big sticky-cta"
        data-testid="done"
        disabled={busy || !tagsOk(sel)}
        onClick={async () => {
          setBusy(true)
          setErr(null)
          try {
            const r = await rpc<{ me: Me; invite: Invite | null }>('save_interests', { p_tags: sel })
            onDone(r.invite)
            setMe(r.me)
          } catch (e) {
            setErr((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Tražimo tim…' : 'Gotovo'}
      </button>
    </div>
  )
}

function Reveal({ inv, onClose }: { inv: Invite; onClose: () => void }) {
  const { toast, confetti } = useApp()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    try {
      navigator.vibrate?.([60, 40, 60])
    } catch {
      /* ignore */
    }
  }, [])
  return (
    <div className="page center reveal">
      <InviteCard
        inv={inv}
        busy={busy}
        onAnswer={async (accept) => {
          setBusy(true)
          try {
            await rpc('respond_invite', { p_invite: inv.id, p_accept: accept })
            if (accept) {
              confetti()
              toast('Dobro došli u tim! 🎉', '💜')
              nav('/timovi')
            }
            onClose()
          } catch (e) {
            toast((e as Error).message, '⚠️')
            setBusy(false)
          }
        }}
      />
    </div>
  )
}

function Steps({ at }: { at: number }) {
  return (
    <div className="steps" aria-label={`Korak ${at} od 2`}>
      {[1, 2].map((i) => (
        <i key={i} className={i <= at ? 'on' : ''} />
      ))}
    </div>
  )
}
