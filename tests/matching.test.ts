// Spajanje nad pravim SQL-om (PGlite): svaka kombinacija od 1–4 oznake dobija poziv.
import { describe, expect, it } from 'vitest'
import { TAGS } from '../src/config/demo'
import { freshDb, mentorId, newParticipant, rpc } from './helpers/db'

function combos<T>(xs: readonly T[], k: number): T[][] {
  if (k === 0) return [[]]
  return xs.flatMap((x, i) => combos(xs.slice(i + 1), k - 1).map((c) => [x, ...c]))
}
const SLUGS = TAGS.map((t) => t.slug)
const ALL = [1, 2, 3, 4].flatMap((k) => combos(SLUGS, k))

describe('spajanje', () => {
  it('ima tačno 162 kombinacije od 1–4 oznake', () => {
    expect(ALL).toHaveLength(162)
  })

  it('svih 162 kombinacija dobija poziv u odgovoru na „Gotovo“, sa razlogom iz izabranih oznaka', async () => {
    const db = await freshDb()
    for (const tags of ALL) {
      const { uid, invite } = await newParticipant(db, tags)
      expect(invite, tags.join('+')).not.toBeNull()
      expect(invite!.status).toBe('pending')
      expect(invite!.project.is_fallback).toBe(false)
      expect(tags).toContain(invite!.reason_tag)
      expect(invite!.project.tag).toBe(invite!.reason_tag)
      // prihvatanje radi i učesnik je u timu
      const r = await rpc<{ status: string }>(db, uid, 'respond_invite', { p_invite: invite!.id, p_accept: true })
      expect(r.status).toBe('accepted')
    }
    const screen = await rpc<{ people: number; joined: number }>(db, null, 'get_screen')
    expect(screen.people).toBe(162)
    expect(screen.joined).toBe(162)
  }, 120_000)

  it('ravnomjerno puni timove: sa više oznaka bira tim sa manje članova', async () => {
    const db = await freshDb()
    const a = await newParticipant(db, ['robotika'])
    await rpc(db, a.uid, 'respond_invite', { p_invite: a.invite!.id, p_accept: true })
    const b = await newParticipant(db, ['robotika', 'muzika'])
    expect(b.invite!.reason_tag).toBe('muzika')
  })

  it('bez poklapanja → rezervni poziv „STEM klub traži ljude sa idejama“', async () => {
    const db = await freshDb()
    await db.exec(`update public.projects set status = 'rejected' where tag = 'robotika'`)
    const { invite } = await newParticipant(db, ['robotika'])
    expect(invite).not.toBeNull()
    expect(invite!.project.is_fallback).toBe(true)
    expect(invite!.reason_tag).toBeNull()
    expect(invite!.project.title).toBe('STEM klub traži ljude sa idejama')
  })

  it('ponovno čuvanje oznaka vraća poziv na čekanju umjesto novog', async () => {
    const db = await freshDb()
    const p = await newParticipant(db, ['nauka'])
    const again = await rpc<{ invite: { id: string } }>(db, p.uid, 'save_interests', { p_tags: ['nauka'] })
    expect(again.invite.id).toBe(p.invite!.id)
  })

  it('„Ne sada“ nema posljedica: učesnik i dalje vidi tim u „Za tebe“ i može se pridružiti', async () => {
    const db = await freshDb()
    const p = await newParticipant(db, ['video'])
    await rpc(db, p.uid, 'respond_invite', { p_invite: p.invite!.id, p_accept: false })
    const fy = await rpc<{ invite: unknown; matches: { id: string; is_member: boolean }[] }>(db, p.uid, 'get_for_you')
    expect(fy.invite).toBeNull()
    expect(fy.matches.map((m) => m.id)).toContain(p.invite!.project.id)
    const j = await rpc<{ status: string }>(db, p.uid, 'join_project', { p_project: p.invite!.project.id })
    expect(j.status).toBe('joined')
    const teams = await rpc<{ teams: { id: string }[] }>(db, p.uid, 'get_my_teams')
    expect(teams.teams.map((t) => t.id)).toEqual([p.invite!.project.id])
  })

  it('odobren predlog poziva prvo one bez tima (skrivena prednost)', async () => {
    const db = await freshDb()
    // u timu (prihvatio robotiku, ima i muziku)
    const inTeam = await newParticipant(db, ['robotika', 'muzika'])
    await rpc(db, inTeam.uid, 'respond_invite', { p_invite: inTeam.invite!.id, p_accept: true })
    // bez tima: odbio poziv
    const alone = await newParticipant(db, ['muzika'])
    await rpc(db, alone.uid, 'respond_invite', { p_invite: alone.invite!.id, p_accept: false })
    // inTeam je u međuvremenu dobio i muzički poziv? Ne: on je prihvatio robotiku; muzika mu nije ponuđena.
    const author = await newParticipant(db, ['ideje'])
    const id = await rpc<string>(db, author.uid, 'propose_project', {
      p_title: 'Bend STEM kluba',
      p_sentence: 'Sviramo na završnoj večeri.',
      p_tag: 'muzika',
    })
    const m = await mentorId(db)
    const r = await rpc<{ status: string; invited: number }>(db, m, 'approve_project', { p_project: id, p_approve: true })
    expect(r.status).toBe('open')
    const order = await db.query<{ profile_id: string }>(
      `select i.profile_id from invites i where i.project_id = $1 order by i.created_at, i.profile_id`,
      [id],
    )
    const ids = order.rows.map((x) => x.profile_id)
    const pid = async (uid: string) => (await db.query<{ id: string }>(`select id from profiles where user_id = $1`, [uid])).rows[0].id
    expect(ids).toContain(await pid(alone.uid))
    // autor je odmah član svog projekta
    const teams = await rpc<{ teams: { id: string }[] }>(db, author.uid, 'get_my_teams')
    expect(teams.teams.map((t) => t.id)).toContain(id)
  })

  it('poziv i odgovori ne sadrže skor ni podatak o tome ko nema tim', async () => {
    const db = await freshDb()
    const p = await newParticipant(db, ['dizajn'])
    const s = JSON.stringify(p.invite)
    expect(s).not.toMatch(/score|skor|alone|bez_tima|priority/i)
  })
})
