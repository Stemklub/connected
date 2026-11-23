import { useNavigate } from 'react-router-dom'
import type { Opportunity } from '../data/types'
import { OPP_KIND, fmtDate, tagLabel } from '../i18n/me'
import { Icon } from './Icon'

/** Prilika van škole. Nikad ne nosi značku „Trebaš nam“. */
export function OpportunityCard({ o, compact = false }: { o: Opportunity; compact?: boolean }) {
  const nav = useNavigate()
  const k = OPP_KIND[o.kind]
  return (
    <article className={`card tap opp-card ${o.for_me ? 'for-me' : ''}`} onClick={() => nav(`/prilika/${o.id}`)} data-testid="opportunity-card">
      <div className="pcard">
        <div className="ptile opp">{k.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="opp-kind">{k.label} · {o.organizer}</div>
          <div className="t">{o.title}</div>
          <div className="meta">
            📅 rok {fmtDate(o.deadline)} · 📍 {o.place || '—'}
            {!compact && o.tags.length > 0 && <> · {o.tags.map(tagLabel).join(', ')}</>}
          </div>
          {(o.for_me || o.interested) && (
            <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
              {o.for_me && <span className="badge forme" data-testid="for-me">✨ Za tebe</span>}
              {o.interested && <span className="badge green">✓ Prijavljen/a</span>}
            </div>
          )}
        </div>
        <span className="chev"><Icon name="chev" size={20} /></span>
      </div>
    </article>
  )
}
