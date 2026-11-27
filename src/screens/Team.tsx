// /#/tim/:id — pregled tima: cilj, rok, oznaka i svi članovi.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp, useLoad } from '../state'
import { rpc, type TeamDetail } from '../lib/api'
import { tagIcon, tagLabel } from '../config/demo'
import { fmtDate, members } from '../lib/format'
import { Icon } from '../components/Icon'

export function Team() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast, confetti } = useApp()
  const { data, error, reload } = useLoad(() => rpc<TeamDetail>('get_team', { p_project: id }), [id])
  const [busy, setBusy] = useState(false)

  const back = (
    <button className="back" onClick={() => (history.length > 1 ? nav(-1) : nav('/timovi'))}>
      <Icon name="chev" size={18} /> Nazad
    </button>
  )
  if (error)
    return (
      <div className="page">
        {back}
        <div className="error-box">{/Could not find the function/i.test(error) ? 'Pregled tima još nije uključen na serveru.' : error}</div>
      </div>
    )
  if (!data) return <div className="page">{back}<div className="spinner" /></div>
  const p = data.project

  return (
    <div className="page" data-testid="team-page">
      {back}
      <div className="team-head">
        <div className="ptile big">{tagIcon(p.tag)}</div>
        <h1>{p.title}</h1>
        <p className="muted">{p.sentence}</p>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}>
          <span className="badge">{p.tag ? `${tagIcon(p.tag)} ${tagLabel(p.tag)}` : 'Za sve'}</span>
          <span className="badge grey">📅 rok {fmtDate(p.deadline)}</span>
        </div>
      </div>

      <div className="card row" data-testid="team-mentor">
        <span className="avatar mentor-av">🧑‍🏫</span>
        <div>
          <div className="tiny">Mentor tima</div>
          <b className="head">{p.mentor || 'Biće određen uskoro'}</b>
        </div>
      </div>

      <div className="card stack">
        <div className="row spread">
          <h3>Članovi</h3>
          <span className="badge" data-testid="team-count">{members(data.members.length)}</span>
        </div>
        {data.members.length === 0 ? (
          <p className="small muted">Još nema nikoga. Budi prvi/a!</p>
        ) : (
          <div className="members" data-testid="team-members">
            {data.members.map((m) => (
              <span key={m.nick} className={`member ${m.me ? 'me' : ''}`}>
                <span className="avatar">{m.nick.slice(0, 1)}</span>
                {m.nick}
                {m.me && <span className="tiny">(ti)</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {p.is_member ? (
        <p className="badge green" style={{ alignSelf: 'center' }}>✓ Ti si u ovom timu</p>
      ) : (
        p.status === 'open' && (
          <button
            className="btn block"
            disabled={busy}
            data-testid="team-join"
            onClick={async () => {
              setBusy(true)
              try {
                await rpc('join_project', { p_project: p.id })
                confetti()
                toast('Dobro došli u tim! 🎉', '💜')
                await reload()
              } catch (e) {
                toast((e as Error).message, '⚠️')
              } finally {
                setBusy(false)
              }
            }}
          >
            Pridruži se
          </button>
        )
      )}
    </div>
  )
}
