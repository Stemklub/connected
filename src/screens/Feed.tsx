import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp, useLive } from '../state'
import { ProjectCard } from '../components/ProjectCard'
import { OpportunityCard } from '../components/OpportunityCard'
import { Icon } from '../components/Icon'
import type { ProjectItem } from '../data/types'

type Filter = 'sve' | 'pozivi' | 'utoku' | 'uradjeno' | 'van'
const FILTERS: [Filter, string][] = [['sve', 'Sve'], ['van', 'Van škole'], ['pozivi', 'Pozivi'], ['utoku', 'U toku'], ['uradjeno', 'Urađeno']]

export function Feed() {
  const { ds, me, toast, confetti, setInviteHold } = useApp()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const f = (FILTERS.find(([k]) => k === params.get('tab'))?.[0] ?? 'sve') as Filter
  const setF = (k: Filter) => setParams(k === 'sve' ? {} : { tab: k }, { replace: true })
  const { data, error, reload } = useLive(() => ds.getFeed(), ['feed', 'invites'])
  const { data: opps } = useLive(() => ds.getOpportunities(), ['opportunities', 'reset'])

  // Na kartici „Van škole“ baner „Trebaš nam“ se ne prikazuje.
  useEffect(() => {
    setInviteHold(f === 'van')
    return () => setInviteHold(false)
  }, [f, setInviteHold])

  const join = async (p: ProjectItem) => {
    try {
      const r = await ds.joinProject(p.id)
      if (r === 'full') return toast('Tim se upravo popunio. Biće još prilika!', '💜')
      confetti()
      toast('Dobro došli u tim! 🎉', '💜')
      nav(`/projekat/${p.id}`)
    } catch (e) {
      toast((e as Error).message, '⚠️')
      reload()
    }
  }

  const items = (data ?? []).filter((p) =>
    f === 'sve' ? true : f === 'pozivi' ? !!p.invite || (p.status === 'open' && p.free > 0) : f === 'utoku' ? p.status === 'open' || p.status === 'pending' : p.status === 'done',
  )
  const forMe = (opps ?? []).filter((o) => o.for_me)
  const top = (forMe.length ? forMe : opps ?? []).slice(0, 2)

  return (
    <div className="page">
      <h1>{f === 'van' ? 'Van škole' : 'Šta ima novo?'}</h1>
      <div className="filters" role="tablist">
        {FILTERS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>
        ))}
      </div>

      {f === 'van' && (
        <>
          <p className="muted small">Takmičenja, hakatoni, radionice, predavanja, konkursi i volontiranje. Prvo one koje odgovaraju tvojim oznakama.</p>
          {!opps && <div className="spinner" />}
          {opps && opps.length === 0 && <p className="empty">Trenutno nema otvorenih prilika. Uskoro! ✨</p>}
          {opps?.map((o) => <OpportunityCard key={o.id} o={o} />)}
        </>
      )}

      {f !== 'van' && (
        <>
          {f === 'sve' && top.length > 0 && (
            <section className="stack" data-testid="out-for-you">
              <div className="section-title">
                <h2>{forMe.length ? 'Van škole · za tebe' : 'Van škole'}</h2>
                <button className="link-btn" style={{ color: 'var(--violet)', textDecoration: 'none', fontWeight: 700 }} onClick={() => setF('van')} data-testid="all-opps">
                  Sve prilike →
                </button>
              </div>
              {top.map((o) => <OpportunityCard key={o.id} o={o} compact />)}
            </section>
          )}
          {f === 'sve' && <h2 style={{ marginTop: 6 }}>U školi</h2>}
          {me?.role === 'student' && f === 'sve' && (
            <Link to="/novi" className="card tap row" style={{ textDecoration: 'none', color: 'inherit', background: 'var(--violet-soft)', boxShadow: 'none' }} data-testid="new-project">
              <div className="ptile" style={{ background: '#fff' }}><Icon name="plus" size={26} /></div>
              <div>
                <b className="head">Pokreni projekat</b>
                <p className="small muted">Imaš ideju? Okupi tim po talentima.</p>
              </div>
            </Link>
          )}
          {error && <div className="error-box">{error}</div>}
          {!data && !error && <div className="spinner" />}
          {data && items.length === 0 && <p className="empty">Ovdje još nema ničega. Uskoro! ✨</p>}
          {items.map((p) => (
            <ProjectCard key={p.id} p={p} onJoin={me?.role === 'student' ? join : undefined} />
          ))}
        </>
      )}
    </div>
  )
}

export function MyGroups() {
  const { ds } = useApp()
  const { data } = useLive(() => ds.getMyGroups(), ['feed', 'invites'])
  return (
    <div className="page">
      <h1>Moji timovi</h1>
      {!data && <div className="spinner" />}
      {data && data.length === 0 && (
        <div className="empty">
          <p>Još nisi u timu. Pogledaj pozive u feedu ili pokreni svoj projekat. ✨</p>
          <Link to="/novi" className="btn small soft" style={{ marginTop: 12, textDecoration: 'none' }}>Pokreni projekat</Link>
        </div>
      )}
      {data?.map((p) => <ProjectCard key={p.id} p={p} />)}
    </div>
  )
}
