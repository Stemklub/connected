// „Za tebe“: poziv na čekanju + timovi po mojim interesovanjima + ostali timovi.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp, useLoad } from '../state'
import { rpc, type ForYou as FY } from '../lib/api'
import { InviteCard, TeamCard } from '../components/bits'

export function ForYou() {
  const { me, toast, confetti } = useApp()
  const nav = useNavigate()
  const { data, error, reload } = useLoad(() => rpc<FY>('get_for_you'), [me?.id])
  const [busy, setBusy] = useState(false)
  const [showOthers, setShowOthers] = useState(false)

  const act = async (fn: () => Promise<unknown>, joined: boolean) => {
    setBusy(true)
    try {
      await fn()
      if (joined) {
        confetti()
        toast('Dobro došli u tim! 🎉', '💜')
        nav('/timovi')
        return
      }
      await reload()
    } catch (e) {
      toast((e as Error).message, '⚠️')
    } finally {
      setBusy(false)
    }
  }

  if (error)
    return (
      <div className="page">
        <div className="error-box">{error}</div>
        <button className="btn ghost" onClick={() => void reload()}>Probaj ponovo</button>
      </div>
    )
  if (!data) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <h1>Za tebe</h1>
      {data.invite && (
        <InviteCard
          inv={data.invite}
          busy={busy}
          onAnswer={(accept) => act(() => rpc('respond_invite', { p_invite: data.invite!.id, p_accept: accept }), accept)}
        />
      )}
      <div className="section-title"><h2>Po tvojim interesovanjima</h2></div>
      {data.matches.length === 0 && <p className="tiny">Trenutno nema timova za tvoja interesovanja. Pogledaj ostale ispod.</p>}
      {data.matches.map((p) => (
        <TeamCard key={p.id} p={p} busy={busy} onJoin={() => act(() => rpc('join_project', { p_project: p.id }), true)} />
      ))}
      {data.others.length > 0 && (
        <>
          <button className="btn ghost small" onClick={() => setShowOthers((s) => !s)} data-testid="others-toggle">
            {showOthers ? 'Sakrij ostale timove' : `Ostali timovi (${data.others.length})`}
          </button>
          {showOthers &&
            data.others.map((p) => (
              <TeamCard key={p.id} p={p} busy={busy} onJoin={() => act(() => rpc('join_project', { p_project: p.id }), true)} />
            ))}
        </>
      )}
    </div>
  )
}
