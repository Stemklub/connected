import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp, useLive } from '../state'
import { fmtAgo, tagLabel } from '../i18n/me'
import type { Metrics, NewOpportunity, OpportunityKind } from '../data/types'
import { TAGS } from '../config/school'
import { OPP_KIND } from '../i18n/me'

export function Mentor() {
  const { ds, toast } = useApp()
  const nav = useNavigate()
  const { data, error, reload } = useLive(() => ds.getMentorDashboard(), ['mentor', 'feed', 'reset'])
  const [showCodes, setShowCodes] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true)
    try {
      await fn()
      if (msg) toast(msg, '✅')
      reload()
    } catch (e) {
      toast((e as Error).message, '⚠️')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="page"><div className="error-box">{error}</div></div>
  if (!data) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <h1>Mentor</h1>
      <MetricsGrid m={data.metrics} />
      <p className="tiny">Samo zbirni brojevi. Bez imena i bez spiskova učenika.</p>

      <PublishOpportunity />

      <div className="section-title"><h2>Na odobrenju</h2><span className="badge">{data.pending.length}</span></div>
      {data.pending.length === 0 && <p className="tiny">Nema projekata koji čekaju.</p>}
      {data.pending.map((p) => (
        <div key={p.id} className="card stack" data-testid="pending-project">
          <div className="pcard">
            <div className="ptile">{p.icon}</div>
            <div>
              <div className="t head">{p.title}</div>
              <div className="meta">{p.tags.map(tagLabel).join(' · ')} · vodi {p.leader_nick} · {fmtAgo(p.created_at)}</div>
              <p className="small" style={{ marginTop: 6 }}>{p.goal}</p>
            </div>
          </div>
          <div className="row">
            <button className="btn small" style={{ flex: 1 }} disabled={busy} data-testid="approve" onClick={() => act(() => ds.approveProject(p.id, true), 'Odobreno. Pozivi su poslati.')}>✓ Odobri</button>
            <button className="btn small ghost" disabled={busy} onClick={() => act(() => ds.approveProject(p.id, false))}>Odbij</button>
          </div>
        </div>
      ))}

      <div className="section-title"><h2>Treba pomoć</h2><span className="demo-pill">Demo</span></div>
      {data.help.length === 0 && <p className="tiny">Nema novih signala.</p>}
      {data.help.map((h) => (
        <div key={h.id} className="card row spread" data-testid="help-signal">
          <div>
            <b>{h.nick}</b> <span className="tiny">{h.class_label} · {fmtAgo(h.created_at)}</span>
            {h.note && <p className="small muted">„{h.note}“</p>}
          </div>
          <button className="btn small soft" onClick={() => act(() => ds.resolveHelp(h.id))}>Javio/la sam se</button>
        </div>
      ))}

      <div className="section-title"><h2>Timovi u toku</h2></div>
      {data.groups.map((p) => (
        <div key={p.id} className="card tap row" onClick={() => nav(`/projekat/${p.id}`)}>
          <div className="ptile" style={{ width: 40, height: 40, fontSize: 20 }}>{p.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b className="small">{p.title}</b>
            <div className="tiny">{p.members.map((m) => m.nick).join(', ')}</div>
          </div>
          <span className="tiny">zid →</span>
        </div>
      ))}

      <div className="section-title">
        <h2>Neiskorišćeni kodovi</h2>
        <button className="btn small ghost" onClick={() => setShowCodes((s) => !s)}>{showCodes ? 'Sakrij' : `Prikaži (${data.codes.length})`}</button>
      </div>
      {showCodes && (
        <div className="stack" data-testid="codes" style={{ gap: 8 }}>
          {groupCodes(data.codes).map(([label, list]) => (
            <div key={label} className="code-row">
              <b>{label}</b>
              <div className="chips">
                {list.map((c) => <code key={c}>{c}</code>)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card stack" style={{ marginTop: 10 }}>
        <h3>Resetuj demo</h3>
        <p className="small muted">Vraća bazu na početno stanje: briše naloge učenika napravljene tokom probe, vraća kodove i projekte. Mentorski nalozi ostaju.</p>
        {!confirmReset ? (
          <button className="btn danger block" onClick={() => setConfirmReset(true)} data-testid="reset">Resetuj demo</button>
        ) : (
          <div className="row">
            <button className="btn danger" style={{ flex: 1 }} disabled={busy} data-testid="reset-confirm" onClick={() => act(async () => {
              await ds.resetDemo()
              setConfirmReset(false)
            }, 'Demo je vraćen na početak.')}>Da, resetuj</button>
            <button className="btn ghost" onClick={() => setConfirmReset(false)}>Odustani</button>
          </div>
        )}
      </div>
    </div>
  )
}

function groupCodes(codes: { code: string; role: string; class_label: string | null }[]): [string, string[]][] {
  const m = new Map<string, string[]>()
  for (const c of codes) {
    const k = c.role === 'student' ? c.class_label ?? '' : c.role === 'mentor' ? 'Mentor' : 'Pedagog'
    m.set(k, [...(m.get(k) ?? []), c.code])
  }
  return [...m.entries()]
}

function PublishOpportunity() {
  const { ds, toast, emitLocal } = useApp()
  const empty: NewOpportunity = { title: '', kind: 'radionica', organizer: '', deadline: null, place: '', audience: '', description: '', tags: [] }
  const [open, setOpen] = useState(false)
  const [o, setO] = useState<NewOpportunity>(empty)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof NewOpportunity>(k: K, v: NewOpportunity[K]) => setO((x) => ({ ...x, [k]: v }))
  const ok = o.title.trim().length >= 3 && o.organizer.trim() && o.tags.length > 0

  if (!open)
    return (
      <button className="btn block soft" onClick={() => setOpen(true)} data-testid="publish-opp-open">🌍 Objavi priliku van škole</button>
    )
  return (
    <form
      className="card stack"
      data-testid="publish-opp"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setErr(null)
        try {
          await ds.createOpportunity(o)
          toast('Prilika je objavljena. Učenici kojima odgovara dobili su obavještenje.', '🌍')
          emitLocal('opportunities')
          setO(empty)
          setOpen(false)
        } catch (e) {
          setErr((e as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h3>Objavi priliku van škole</h3>
      <div className="field"><label htmlFor="op-t">Naziv</label>
        <input id="op-t" className="input" value={o.title} maxLength={100} placeholder="npr. Hakaton za srednjoškolce" onChange={(e) => set('title', e.target.value)} /></div>
      <div className="field"><label>Vrsta</label>
        <div className="chips">
          {(Object.keys(OPP_KIND) as OpportunityKind[]).map((k) => (
            <button type="button" key={k} className={`chip small ${o.kind === k ? 'on' : ''}`} onClick={() => set('kind', k)}>{OPP_KIND[k].icon} {OPP_KIND[k].label}</button>
          ))}
        </div></div>
      <div className="field"><label htmlFor="op-o">Organizator</label>
        <input id="op-o" className="input" value={o.organizer} maxLength={100} onChange={(e) => set('organizer', e.target.value)} /></div>
      <div className="row" style={{ gap: 10 }}>
        <div className="field" style={{ flex: 1 }}><label htmlFor="op-d">Rok</label>
          <input id="op-d" className="input" type="date" value={o.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || null)} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="op-p">Mjesto</label>
          <input id="op-p" className="input" value={o.place} maxLength={100} placeholder="Bar / Online" onChange={(e) => set('place', e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="op-a">Za koga</label>
        <input id="op-a" className="input" value={o.audience} maxLength={120} placeholder="npr. II–IV razred" onChange={(e) => set('audience', e.target.value)} /></div>
      <div className="field"><label htmlFor="op-desc">Opis</label>
        <textarea id="op-desc" className="input" value={o.description} maxLength={800} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="field"><label>Oblast (oznake)</label>
        <div className="chips">
          {TAGS.map((t) => {
            const on = o.tags.includes(t.slug)
            return (
              <button type="button" key={t.slug} className={`chip small ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => set('tags', on ? o.tags.filter((x) => x !== t.slug) : [...o.tags, t.slug])}>{t.icon} {t.label}</button>
            )
          })}
        </div></div>
      {err && <div className="error-box">{err}</div>}
      <div className="row">
        <button className="btn small" style={{ flex: 1 }} disabled={!ok || busy}>Objavi</button>
        <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>Odustani</button>
      </div>
      <p className="tiny">Objavio/la: tvoj nik. Učenici sa poklapajućim oznakama dobijaju obavještenje.</p>
    </form>
  )
}

function MetricsGrid({ m }: { m: Metrics }) {
  const prev = useRef(m)
  const [bump, setBump] = useState<string | null>(null)
  useEffect(() => {
    const p = prev.current
    const k = (Object.keys(m) as (keyof Metrics)[]).find((x) => m[x] !== p[x])
    prev.current = m
    if (k) {
      setBump(k)
      const t = setTimeout(() => setBump(null), 1000)
      return () => clearTimeout(t)
    }
  }, [m])
  const cls = (k: keyof Metrics, extra = '') => `metric ${extra} ${bump === k ? 'bump' : ''}`
  return (
    <div className="metrics" data-testid="metrics">
      <div className={cls('in_group_pct', 'hero')}><b data-testid="m-pct">{m.in_group_pct}%</b><span>učenika je u bar jednoj grupi</span></div>
      <div className={cls('zero_to_one', 'hero')}><b data-testid="m-0to1">{m.zero_to_one}</b><span>prešlo sa 0 na 1 grupu</span></div>
      <div className={cls('done')}><b data-testid="m-done">{m.done}</b><span>završenih projekata</span></div>
      <div className={cls('mixed_groups')}><b data-testid="m-mixed">{m.mixed_groups}</b><span>grupa iz više odjeljenja</span></div>
    </div>
  )
}
