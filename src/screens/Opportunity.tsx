import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp, useLive } from '../state'
import { Icon } from '../components/Icon'
import { OPP_KIND, fmtAgo, fmtDate, tagIcon, tagLabel } from '../i18n/me'

export function OpportunityPage() {
  const { id = '' } = useParams()
  const { ds, me, toast, setInviteHold } = useApp()
  const nav = useNavigate()
  const { data: o, loaded, reload } = useLive(() => ds.getOpportunity(id), ['opportunities', 'feed'], [id])
  const [busy, setBusy] = useState(false)

  // Dok učenik čita priliku, kartica poziva „Trebaš nam“ ne iskače.
  useEffect(() => {
    setInviteHold(true)
    return () => setInviteHold(false)
  }, [setInviteHold])

  if (!loaded) return <div className="page"><div className="spinner" /></div>
  if (!o) return <div className="page"><p className="empty">Prilika nije pronađena.</p></div>
  const k = OPP_KIND[o.kind]
  const student = me?.role === 'student'

  const toggle = async () => {
    setBusy(true)
    try {
      const on = await ds.toggleOpportunityInterest(o.id)
      toast(on ? 'Označeno: prijavljen/a si. Srećno! 🍀' : 'Prijava je poništena.', on ? '✅' : '↩️')
      reload()
    } catch (e) {
      toast((e as Error).message, '⚠️')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <button className="icon-btn" aria-label="Nazad" onClick={() => nav(-1)} style={{ marginLeft: -8 }}><Icon name="back" /></button>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="ptile big opp" style={{ width: 64, height: 64, fontSize: 34, borderRadius: 18 }}>{k.icon}</div>
        <div style={{ flex: 1 }}>
          <div className="opp-kind">{k.label} · van škole</div>
          <h2 data-testid="opportunity-title">{o.title}</h2>
          <p className="small muted" style={{ marginTop: 4 }}>{o.organizer}</p>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {o.for_me && <span className="badge forme">✨ Za tebe</span>}
        {o.interested && <span className="badge green">✓ Prijavljen/a</span>}
        {o.tags.map((t) => <span key={t} className="badge grey">{tagIcon(t)} {tagLabel(t)}</span>)}
      </div>

      <div className="info-grid">
        <div className="info"><div className="ic">📅</div><b>Rok</b><span>{fmtDate(o.deadline)}</span></div>
        <div className="info"><div className="ic">📍</div><b>Mjesto</b><span>{o.place || '—'}</span></div>
        <div className="info"><div className="ic">🙋</div><b>Za koga</b><span>{o.audience || 'Svi'}</span></div>
      </div>

      <div className="card stack">
        <p style={{ whiteSpace: 'pre-wrap' }}>{o.description}</p>
        <p className="tiny">Objavio/la: {o.posted_by} · {fmtAgo(o.created_at)}</p>
      </div>

      {student && (
        <div className="stack">
          <button className={`btn block ${o.interested ? 'ghost' : ''}`} disabled={busy} onClick={toggle} data-testid="opp-interest">
            {o.interested ? '✓ Prijavljen/a · poništi' : 'Zanima me — prijavi me'}
          </button>
          <button className="btn block soft" onClick={() => nav(`/novi?prilika=${o.id}`)} data-testid="opp-team">
            👋 Ko ide sa mnom? Napravi tim
          </button>
          <p className="tiny" style={{ textAlign: 'center' }}>Tim ide mentoru na odobrenje, pa šaljemo pozive onima koji to vole i znaju.</p>
        </div>
      )}

      {o.teams.length > 0 && (
        <div className="card stack">
          <h3>Timovi za ovu priliku</h3>
          {o.teams.map((t) => (
            <div key={t.id} className="row tap" style={{ cursor: 'pointer' }} onClick={() => nav(`/projekat/${t.id}`)}>
              <div className="ptile" style={{ width: 40, height: 40, fontSize: 20 }}>{t.icon}</div>
              <div style={{ flex: 1 }}>
                <b className="small">{t.title}</b>
                <div className="tiny">vodi {t.leader_nick}{t.is_member ? ' · tvoj tim' : t.free > 0 ? ' · ima mjesta' : ''}</div>
              </div>
              <Icon name="chev" size={18} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
