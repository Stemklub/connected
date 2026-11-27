// Mali zajednički dijelovi: zaglavlje, oznake, kartica tima, poziv, „Imam kod“.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { APP, MAX_TAGS, MIN_TAGS, TAGS, tagIcon, tagLabel } from '../config/demo'
import { fmtDate, members, needYou } from '../lib/format'
import { redeemCode, type Invite, type Me, type Project } from '../lib/api'

const icon = `${import.meta.env.BASE_URL}icon-192.png`

export function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="header">
      <Link to="/" className="brand" aria-label={APP.name}>
        <img src={icon} alt="" />
        <b>{APP.name}</b>
      </Link>
      <span className="spacer" />
      {right ?? <span className="demo-pill">Demo</span>}
    </header>
  )
}

export function TagPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const full = value.length >= MAX_TAGS
  return (
    <div className="tag-grid" role="group" aria-label="Interesovanja">
      {TAGS.map((t) => {
        const on = value.includes(t.slug)
        return (
          <button
            key={t.slug}
            type="button"
            className={`tag ${on ? 'on' : ''}`}
            data-testid={`tag-${t.slug}`}
            aria-pressed={on}
            disabled={!on && full}
            onClick={() => onChange(on ? value.filter((x) => x !== t.slug) : [...value, t.slug])}
          >
            <span className="ti">{t.icon}</span>
            <span>{t.label}</span>
            {on && <span className="tick">✓</span>}
          </button>
        )
      })}
    </div>
  )
}

export const tagsOk = (v: string[]) => v.length >= MIN_TAGS && v.length <= MAX_TAGS

export function TeamCard({ p, onJoin, busy }: { p: Project; onJoin?: () => void; busy?: boolean }) {
  const nav = useNavigate()
  return (
    <article className="card team tap" data-testid="team-card" role="link" tabIndex={0} aria-label={`Tim: ${p.title}`}
      onClick={() => nav(`/tim/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/tim/${p.id}`)}>
      <div className="pcard">
        <div className="ptile">{tagIcon(p.tag)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t">{p.title}</div>
          <p className="small muted" style={{ marginTop: 2 }}>{p.sentence}</p>
          <div className="meta">
            {p.tag ? tagLabel(p.tag) : 'Za sve'} · {members(p.member_count)} · rok {fmtDate(p.deadline)}
          </div>
          {p.members.length > 0 && <div className="tiny" style={{ marginTop: 4 }}>{p.members.slice(0, 6).join(' · ')}</div>}
        </div>
        <span className="chev"><Icon name="chev" size={20} /></span>
      </div>
      {onJoin && (
        <div style={{ marginTop: 10 }}>
          {p.is_member ? (
            <span className="badge green">✓ Tvoj tim</span>
          ) : (
            <button className="btn small soft" disabled={busy} onClick={(e) => { e.stopPropagation(); onJoin() }} data-testid="join">Pridruži se</button>
          )}
        </div>
      )}
    </article>
  )
}

export function InviteCard({ inv, onAnswer, busy }: { inv: Invite; onAnswer: (accept: boolean) => void; busy?: boolean }) {
  const p = inv.project
  return (
    <section className="invite" data-testid="invite-card" aria-label="Poziv">
      <span className="new-badge">POZIV</span>
      <div className="ptile big">{tagIcon(p.tag)}</div>
      <h1>{needYou(p.join_text)}</h1>
      <p className="lead"><b>{p.title}</b>. {p.sentence}</p>
      <span className="why" data-testid="invite-why">
        {inv.reason_tag ? <>{tagIcon(inv.reason_tag)} Zašto ti: {tagLabel(inv.reason_tag)}</> : <>💡 {APP.club} traži ljude sa idejama</>}
      </span>
      <p className="tiny" style={{ marginTop: 10 }}>
        {p.member_count > 0 ? `U timu: ${p.members.slice(0, 4).join(', ')}${p.member_count > 4 ? ` i još ${p.member_count - 4}` : ''}` : 'Budi prvi/a u timu.'}
      </p>
      <div className="actions">
        <button className="btn block" disabled={busy} onClick={() => onAnswer(true)}>Pridružujem se</button>
        <button className="btn block ghost" disabled={busy} onClick={() => onAnswer(false)}>Ne sada</button>
      </div>
    </section>
  )
}

/** „Imam kod“: nastavi svoj nalog na ovom uređaju. */
export function CodeDialog({ onDone, onClose, hasAccount }: { onDone: (me: Me) => void; onClose: () => void; hasAccount: boolean }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Imam kod" onClick={onClose}>
      <form
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setErr(null)
          try {
            onDone(await redeemCode(code))
          } catch (x) {
            setErr((x as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="grab" />
        <h2>Imam kod</h2>
        <p className="small muted">Kod iz profila na drugom telefonu. Sa njim nastavljaš kao isti učesnik.</p>
        <input
          className="input code"
          data-testid="code-input"
          aria-label="Kod"
          value={code}
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="K7P3M"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        {hasAccount && <p className="tiny">Nalog koji je sada na ovom telefonu biće zamijenjen.</p>}
        {err && <div className="error-box">{err}</div>}
        <button className="btn block" disabled={busy || code.replace(/\W/g, '').length < 5}>Nastavi</button>
        <button type="button" className="link-btn" onClick={onClose}>Odustani</button>
      </form>
    </div>
  )
}
