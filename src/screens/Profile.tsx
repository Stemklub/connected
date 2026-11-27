// Profil: nik, interesovanja, moj kod i „Imam kod“.
import { useState } from 'react'
import { useApp } from '../state'
import { tagIcon, tagLabel } from '../config/demo'
import { rpc, type Invite, type Me } from '../lib/api'
import { CodeDialog, TagPicker, tagsOk } from '../components/bits'
import { NickChooser } from './Entry'

export function Profile() {
  const { me, setMe, toast } = useApp()
  const [editNick, setEditNick] = useState(false)
  const [editTags, setEditTags] = useState<string[] | null>(null)
  const [code, setCode] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!me) return null

  return (
    <div className="page">
      <h1 data-testid="profile-nick">{me.nick}</h1>

      <div className="card stack">
        <div className="row spread">
          <h3>Ime</h3>
          <button className="btn small soft" onClick={() => setEditNick((s) => !s)}>{editNick ? 'Zatvori' : 'Promijeni'}</button>
        </div>
        {editNick && (
          <NickChooser
            current={me.nick}
            onChosen={(m) => {
              setMe(m)
              setEditNick(false)
            }}
          />
        )}
      </div>

      <div className="card stack">
        <div className="row spread">
          <h3>Interesovanja</h3>
          {!editTags && <button className="btn small soft" onClick={() => setEditTags(me.tags)} data-testid="edit-tags">Uredi</button>}
        </div>
        {editTags ? (
          <>
            <TagPicker value={editTags} onChange={setEditTags} />
            <div className="row">
              <button
                className="btn small"
                style={{ flex: 1 }}
                disabled={busy || !tagsOk(editTags)}
                data-testid="save-tags"
                onClick={async () => {
                  setBusy(true)
                  try {
                    const r = await rpc<{ me: Me; invite: Invite | null }>('save_interests', { p_tags: editTags })
                    setMe(r.me)
                    setEditTags(null)
                    toast(r.invite ? 'Sačuvano. Čeka te poziv u „Za tebe“.' : 'Sačuvano.', r.invite ? '✨' : '✅')
                  } catch (e) {
                    toast((e as Error).message, '⚠️')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Sačuvaj
              </button>
              <button className="btn small ghost" onClick={() => setEditTags(null)}>Odustani</button>
            </div>
          </>
        ) : (
          <div className="chips">
            {me.tags.map((t) => (
              <span key={t} className="chip small on">{tagIcon(t)} {tagLabel(t)}</span>
            ))}
          </div>
        )}
      </div>

      <div className="card stack">
        <h3>Tvoj kod</h3>
        <p className="code-big" data-testid="my-code">{me.code ?? '—'}</p>
        <p className="tiny">Sa ovim kodom nastavljaš na drugom telefonu. Ne dijeli ga.</p>
        <button className="link-btn" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setCode(true)} data-testid="have-code">
          Imam kod
        </button>
      </div>

      <div className="card stack">
        <h3>O demo verziji</h3>
        <p className="small muted">
          Nema imena, emaila ni lozinke: samo izabrano ime i interesovanja. Nema lajkova ni rang-lista, samo timovi.
          Demo se poslije prezentacije briše.
        </p>
      </div>

      {code && (
        <CodeDialog
          hasAccount
          onClose={() => setCode(false)}
          onDone={(m) => {
            setMe(m)
            setCode(false)
            toast(`Nastavljaš kao ${m.nick}.`, '👋')
          }}
        />
      )}
    </div>
  )
}
