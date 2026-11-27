// „Moji timovi“: timovi u kojima sam + moji predlozi. „Predloži projekat“ je samo sekundarni link.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useLoad } from '../state'
import { rpc, type MyTeams } from '../lib/api'
import { TAGS, tagIcon } from '../config/demo'
import { TeamCard } from '../components/bits'

export function Teams() {
  const { data, error, reload } = useLoad(() => rpc<MyTeams>('get_my_teams'))
  const [propose, setPropose] = useState(false)

  if (error) return <div className="page"><div className="error-box">{error}</div></div>
  if (!data) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <h1>Moji timovi</h1>
      {data.teams.length === 0 && (
        <div className="card empty">
          Još nisi u timu. <Link to="/">Pogledaj „Za tebe“</Link>.
        </div>
      )}
      {data.teams.map((p) => (
        <TeamCard key={p.id} p={p} />
      ))}

      {data.proposals.length > 0 && (
        <>
          <div className="section-title"><h2>Moji predlozi</h2></div>
          {data.proposals.map((p) => (
            <div key={p.id} className="card row" data-testid="proposal">
              <div className="ptile" style={{ width: 40, height: 40, fontSize: 20 }}>{tagIcon(p.tag)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b className="small">{p.title}</b>
                <div className="tiny">{p.sentence}</div>
              </div>
              <span className={`badge ${p.status === 'pending' ? 'amber' : 'grey'}`}>
                {p.status === 'pending' ? 'Čeka mentora' : 'Nije odobreno'}
              </span>
            </div>
          ))}
        </>
      )}

      {propose ? (
        <ProposeForm onDone={() => { setPropose(false); void reload() }} onCancel={() => setPropose(false)} />
      ) : (
        <button className="link-btn" style={{ alignSelf: 'center', marginTop: 8 }} onClick={() => setPropose(true)} data-testid="propose-open">
          Imaš ideju? Predloži projekat
        </button>
      )}
    </div>
  )
}

function ProposeForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { toast } = useApp()
  const [title, setTitle] = useState('')
  const [sentence, setSentence] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ok = title.trim().length >= 3 && sentence.trim().length >= 3 && tag
  return (
    <form
      className="card stack"
      data-testid="propose-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setErr(null)
        try {
          await rpc('propose_project', { p_title: title, p_sentence: sentence, p_tag: tag })
          toast('Predlog je poslat mentoru.', '💡')
          onDone()
        } catch (x) {
          setErr((x as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h3>Predloži projekat</h3>
      <div className="field">
        <label htmlFor="pp-t">Naslov</label>
        <input id="pp-t" className="input" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pp-s">Jedna rečenica</label>
        <input id="pp-s" className="input" maxLength={140} value={sentence} onChange={(e) => setSentence(e.target.value)} />
      </div>
      <div className="chips">
        {TAGS.map((t) => (
          <button type="button" key={t.slug} className={`chip small ${tag === t.slug ? 'on' : ''}`} aria-pressed={tag === t.slug} onClick={() => setTag(t.slug)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {err && <div className="error-box">{err}</div>}
      <div className="row">
        <button className="btn small" style={{ flex: 1 }} disabled={!ok || busy}>Pošalji mentoru</button>
        <button type="button" className="btn small ghost" onClick={onCancel}>Odustani</button>
      </div>
    </form>
  )
}
