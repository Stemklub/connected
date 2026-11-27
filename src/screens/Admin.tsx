// /#/admin — mentor: prijave, moderacija predloga, kodovi, CSV za štand, reset.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useLoad } from '../state'
import { logout, mentorLogin, rpc, watchWall, type AdminData, type StandRow } from '../lib/api'
import { tagIcon, tagLabel } from '../config/demo'
import { fmtAgo } from '../lib/format'
import { joinUrl } from './Platno'

export function Admin() {
  const { me } = useApp()
  if (!me || me.role !== 'mentor') return <AdminLogin />
  return <Dashboard />
}

function AdminLogin() {
  const { setMe } = useApp()
  const [nick, setNick] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <form
      className="page center"
      style={{ gap: 14 }}
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setErr(null)
        try {
          setMe(await mentorLogin(nick, pass))
        } catch (x) {
          setErr((x as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h1>Mentor</h1>
      <p className="muted">Prijava za mentore. Učesnici ne trebaju nalog.</p>
      <div className="field">
        <label htmlFor="a-nick">Nik</label>
        <input id="a-nick" className="input" autoCapitalize="none" autoComplete="username" value={nick} onChange={(e) => setNick(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="a-pass">Lozinka</label>
        <input id="a-pass" className="input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </div>
      {err && <div className="error-box">{err}</div>}
      <button className="btn block" disabled={busy || !nick || !pass}>Prijavi se</button>
    </form>
  )
}

function Dashboard() {
  const { setMe, toast } = useApp()
  const { data, error, reload } = useLoad(() => rpc<AdminData>('get_admin'))
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [n, setN] = useState(50)
  const timer = useRef<number | null>(null)

  const soon = useCallback(() => {
    if (timer.current) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      void reload()
    }, 1000)
  }, [reload])
  useEffect(() => watchWall(soon), [soon])
  useEffect(() => {
    const t = setInterval(() => void reload(), 10_000)
    return () => clearInterval(t)
  }, [reload])

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true)
    try {
      await fn()
      if (msg) toast(msg, '✅')
      await reload()
    } catch (e) {
      toast((e as Error).message, '⚠️')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="page"><div className="error-box">{error}</div></div>
  if (!data) return <div className="page"><div className="spinner" /></div>
  const s = data.screen

  return (
    <div className="page admin">
      <div className="row spread">
        <h1>Mentor</h1>
        <button className="btn small ghost" onClick={async () => { await logout(); setMe(null) }}>Odjavi se</button>
      </div>
      <p className="tiny">Prijavljen/a: {data.nick} · reset {fmtAgo(data.reset_at)}</p>

      <div className="metrics">
        <div className="metric hero"><b data-testid="a-people">{s.people}</b><span>učesnika</span></div>
        <div className="metric hero"><b data-testid="a-joined">{s.joined}</b><span>u timovima</span></div>
        <div className="metric"><b data-testid="a-free">{data.codes_free}</b><span>slobodnih kodova</span></div>
        <div className="metric"><b>{data.codes_used}</b><span>iskorišćenih kodova</span></div>
      </div>

      <div className="card switch">
        <div>
          <b className="head">Prijave su {data.registrations_open ? 'otvorene' : 'zatvorene'}</b>
          <p className="tiny">Kad su zatvorene, novi telefoni dobijaju poruku. Ko je već unutra, nastavlja.</p>
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label="Prijave otvorene"
          data-testid="registrations"
          checked={data.registrations_open}
          disabled={busy}
          onChange={(e) => act(() => rpc('set_registrations', { p_open: e.target.checked }))}
        />
      </div>

      <div className="section-title"><h2>Predlozi projekata</h2><span className="badge">{data.proposals.length}</span></div>
      {data.proposals.length === 0 && <p className="tiny">Nema predloga koji čekaju.</p>}
      {data.proposals.map((p) => (
        <div key={p.id} className="card stack" data-testid="pending-proposal">
          <div className="pcard">
            <div className="ptile">{tagIcon(p.tag)}</div>
            <div>
              <div className="t">{p.title}</div>
              <div className="meta">{tagLabel(p.tag)} · {p.nick} · {fmtAgo(p.created_at)}</div>
              <p className="small" style={{ marginTop: 6 }}>{p.sentence}</p>
            </div>
          </div>
          <div className="row">
            <button className="btn small" style={{ flex: 1 }} disabled={busy} data-testid="approve" onClick={() => act(() => rpc('approve_project', { p_project: p.id, p_approve: true }), 'Odobreno. Pozivi su poslati.')}>✓ Odobri</button>
            <button className="btn small ghost" disabled={busy} data-testid="reject" onClick={() => act(() => rpc('approve_project', { p_project: p.id, p_approve: false }))}>Odbij</button>
          </div>
        </div>
      ))}

      <div className="section-title"><h2>Timovi i mentori</h2></div>
      <div className="card stack" style={{ gap: 10 }}>
        {(data.teams ?? s.teams.map((t) => ({ ...t, mentor: null }))).map((t) => (
          <MentorRow key={t.id} team={t} disabled={busy || !data.teams}
            onSave={(v) => act(() => rpc('set_team_mentor', { p_project: t.id, p_mentor: v }), v ? `Mentor tima: ${v}` : 'Mentor je uklonjen.')} />
        ))}
        {!data.teams && <p className="tiny">Za upis mentora pokrenite supabase/zakrpa-mentor-tima.sql.</p>}
        <p className="tiny">Ime mentora vide učesnici na timu i na pozivu. Ostaje i poslije reseta.</p>
      </div>

      <div className="section-title"><h2>Kodovi i štand</h2></div>
      <div className="card stack">
        <div className="row">
          <input className="input" style={{ width: 100 }} type="number" min={1} max={1000} value={n} aria-label="Broj kodova" onChange={(e) => setN(Number(e.target.value))} />
          <button className="btn small soft" style={{ flex: 1 }} disabled={busy} onClick={() => act(() => rpc('generate_codes', { p_n: n }), `Dodato ${n} kodova.`)}>Dodaj kodove</button>
        </div>
        <button className="btn small ghost" data-testid="csv" disabled={busy} onClick={() => act(downloadCsv)}>⬇ CSV: prijave i pridruživanja po izvoru</button>
        <p className="tiny">
          Platno: <Link to="/platno">/#/platno</Link> · Štand: <Link to="/platno?izvor=stand">/#/platno?izvor=stand</Link>
          <br />Link za štand: {joinUrl('stand')}
        </p>
      </div>

      <div className="card stack" style={{ marginTop: 10 }}>
        <h3>Resetuj demo</h3>
        <p className="small muted">Briše sve učesnike (i njihove anonimne naloge), predloge, timove i zid. Kodovi su ponovo slobodni, prijave otvorene. Mentorski nalozi ostaju.</p>
        {!confirm ? (
          <button className="btn danger block" onClick={() => setConfirm(true)} data-testid="reset">Resetuj demo</button>
        ) : (
          <div className="row">
            <button className="btn danger" style={{ flex: 1 }} disabled={busy} data-testid="reset-confirm"
              onClick={() => act(async () => { await rpc('reset_demo'); setConfirm(false) }, 'Demo je vraćen na početak.')}>Da, resetuj</button>
            <button className="btn ghost" onClick={() => setConfirm(false)}>Odustani</button>
          </div>
        )}
      </div>
    </div>
  )
}

function MentorRow({ team, disabled, onSave }: {
  team: { id: string; title: string; tag: string | null; mentor: string | null; members: number }
  disabled: boolean
  onSave: (v: string) => void
}) {
  const [v, setV] = useState(team.mentor ?? '')
  useEffect(() => setV(team.mentor ?? ''), [team.mentor])
  const changed = v.trim() !== (team.mentor ?? '')
  return (
    <form className="mentor-row" data-testid="mentor-row" onSubmit={(e) => { e.preventDefault(); if (changed) onSave(v.trim()) }}>
      <div className="row spread small">
        <span>{tagIcon(team.tag)} {team.title}</span>
        <b title="članova">{team.members}</b>
      </div>
      <div className="row">
        <input className="input small-input" placeholder="Mentor, npr. prof. Marković" maxLength={60} value={v}
          aria-label={`Mentor: ${team.title}`} disabled={disabled && !changed} onChange={(e) => setV(e.target.value)} />
        <button className="btn small soft" disabled={disabled || !changed}>Sačuvaj</button>
      </div>
    </form>
  )
}

export function toCsv(rows: StandRow[]): string {
  return ['izvor,prijave,pridruzivanja', ...rows.map((r) => `${r.izvor},${r.prijave},${r.pridruzivanja}`)].join('\n') + '\n'
}

async function downloadCsv() {
  const rows = await rpc<StandRow[]>('export_stand_stats')
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `connected-stand-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
