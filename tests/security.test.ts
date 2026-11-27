// RLS i prava: klijent ne čita tabele direktno (osim zida), sve ide kroz RPC.
import { describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { anonUser, freshDb, mentorId, newParticipant, rpc } from './helpers/db'

const TABLES = ['demo_settings', 'tags', 'profiles', 'demo_codes', 'profile_tags', 'projects', 'memberships', 'invites']

async function asRole<T>(db: PGlite, uid: string | null, sql: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
    return (await tx.query<T>(sql)).rows
  })
}

describe('RLS i prava', () => {
  it('RLS je uključen na svim tabelama u public', async () => {
    const db = await freshDb()
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    )
    expect(r.rows.length).toBeGreaterThanOrEqual(9)
    for (const row of r.rows) expect(row.relrowsecurity, row.relname).toBe(true)
  })

  it('anon i prijavljen učesnik ne mogu čitati ni pisati tabele direktno', async () => {
    const db = await freshDb()
    const p = await newParticipant(db, ['robotika'])
    for (const uid of [null, p.uid]) {
      for (const t of TABLES) {
        await expect(asRole(db, uid, `select * from public.${t}`), t).rejects.toThrow(/permission denied/)
      }
      await expect(asRole(db, uid, `insert into public.demo_events (nick, text) values ('x', 'y')`)).rejects.toThrow(/permission denied/)
      await expect(asRole(db, uid, `update public.profiles set role = 'mentor'`)).rejects.toThrow(/permission denied/)
      await expect(asRole(db, uid, `select private.load_seed()`)).rejects.toThrow(/permission denied/)
    }
  })

  it('zid platna (demo_events) je javno čitljiv: samo nik i tekst', async () => {
    const db = await freshDb()
    await newParticipant(db, ['robotika'])
    const rows = await asRole<Record<string, unknown>>(db, null, `select * from public.demo_events`)
    expect(rows.length).toBeGreaterThan(0)
    expect(Object.keys(rows[0]).sort()).toEqual(['created_at', 'id', 'nick', 'text'])
  })

  it('anon smije samo get_screen; učesnik ne smije admin funkcije', async () => {
    const db = await freshDb()
    await expect(rpc(db, null, 'get_screen')).resolves.toBeTruthy()
    await expect(rpc(db, null, 'claim_demo_code', {})).rejects.toThrow(/permission denied/)
    await expect(rpc(db, null, 'reset_demo')).rejects.toThrow(/permission denied/)
    const p = await newParticipant(db, ['robotika'])
    for (const [fn, args] of [
      ['reset_demo', {}],
      ['get_admin', {}],
      ['set_registrations', { p_open: false }],
      ['generate_codes', { p_n: 5 }],
      ['export_stand_stats', {}],
    ] as const) {
      await expect(rpc(db, p.uid, fn, args), fn).rejects.toThrow(/Samo za mentore/)
    }
  })

  it('get_screen sadrži samo zbirne brojeve, timove i nikove sa zida', async () => {
    const db = await freshDb()
    await newParticipant(db, ['robotika'])
    const s = await rpc<Record<string, unknown>>(db, null, 'get_screen')
    expect(Object.keys(s).sort()).toEqual(['joined', 'people', 'registrations_open', 'teams', 'wall'])
    expect(JSON.stringify(s)).not.toMatch(/user_id|profile_id|code|source/)
  })

  it('nik: kratka riječ iz ponuđenog skupa (kao Kahoot), jedinstven; kad se potroši, dobija cifru', async () => {
    const db = await freshDb()
    const u = await anonUser(db)
    await rpc(db, u, 'claim_demo_code', {})
    await expect(rpc(db, u, 'set_nick', { p_nick: 'Moj Nik' })).rejects.toThrow(/ponuđenih/)
    await expect(rpc(db, u, 'set_nick', { p_nick: 'Komet1' })).rejects.toThrow(/ponuđenih/)
    await expect(rpc(db, u, 'set_nick', { p_nick: 'Komet' })).resolves.toBeTruthy()
    const w = await anonUser(db)
    await rpc(db, w, 'claim_demo_code', {})
    await expect(rpc(db, w, 'set_nick', { p_nick: 'Laser7' })).resolves.toBeTruthy()
    const v = await anonUser(db)
    await rpc(db, v, 'claim_demo_code', {})
    await expect(rpc(db, v, 'set_nick', { p_nick: 'Laser7' })).rejects.toThrow(/upravo neko uzeo/)
    const pool = (await db.query<{ nick: string }>(`select nick from private.nick_pool()`)).rows.map((r) => r.nick)
    expect(pool.length).toBeGreaterThanOrEqual(90)
    expect(new Set(pool).size).toBe(pool.length)
    for (const n of pool) expect(n, n).toMatch(/^[A-ZČĆŠŽĐ][a-zčćšžđ]{1,7}$/)
    const sugg = await rpc<string[]>(db, v, 'suggest_nicks')
    expect(sugg).toHaveLength(6)
    expect(sugg).not.toContain('Komet')
    for (const n of sugg) expect(n).not.toMatch(/\d/)
    // kad se osnovni skup potroši: Komet2 … Komet9
    await db.query(`insert into public.profiles (nick) select nick from private.nick_pool() on conflict do nothing`)
    const more = await rpc<string[]>(db, v, 'suggest_nicks')
    expect(more).toHaveLength(6)
    for (const n of more) expect(n).toMatch(/^[A-ZČĆŠŽĐ][a-zčćšžđ]+[2-9]$/)
    await expect(rpc(db, v, 'set_nick', { p_nick: more[0] })).resolves.toBeTruthy()
  })

  it('mentor: reset vraća seed u jednoj transakciji i briše učesnike sa njihovim nalozima', async () => {
    const db = await freshDb()
    for (let i = 0; i < 5; i++) {
      const p = await newParticipant(db, ['muzika'])
      await rpc(db, p.uid, 'respond_invite', { p_invite: p.invite!.id, p_accept: true })
    }
    const author = await newParticipant(db, ['ideje'])
    await rpc(db, author.uid, 'propose_project', { p_title: 'Moj predlog', p_sentence: 'Jedna rečenica.', p_tag: 'ideje' })
    const m = await mentorId(db)
    await rpc(db, m, 'set_registrations', { p_open: false })
    const r = await rpc<{ projects: number; codes_free: number }>(db, m, 'reset_demo')
    expect(r).toEqual({ projects: 9, codes_free: 300 })
    const q = async (sql: string) => (await db.query<{ n: number }>(sql)).rows[0].n
    expect(await q(`select count(*)::int as n from auth.users`)).toBe(1)
    expect(await q(`select count(*)::int as n from profiles`)).toBe(1)
    expect(await q(`select count(*)::int as n from memberships`)).toBe(0)
    expect(await q(`select count(*)::int as n from demo_events`)).toBe(0)
    const s = await rpc<{ registrations_open: boolean; people: number }>(db, null, 'get_screen')
    expect(s).toMatchObject({ registrations_open: true, people: 0 })
  })

  it('mentor moderira predloge', async () => {
    const db = await freshDb()
    const a = await newParticipant(db, ['ideje'])
    const id = await rpc<string>(db, a.uid, 'propose_project', { p_title: 'Loš predlog', p_sentence: 'Ne valja.', p_tag: 'ideje' })
    const m = await mentorId(db)
    const adm = await rpc<{ proposals: { id: string; nick: string }[] }>(db, m, 'get_admin')
    expect(adm.proposals.map((x) => x.id)).toEqual([id])
    await rpc(db, m, 'approve_project', { p_project: id, p_approve: false })
    const s = await rpc<{ teams: { id: string }[] }>(db, null, 'get_screen')
    expect(s.teams.map((t) => t.id)).not.toContain(id)
    await expect(rpc(db, a.uid, 'join_project', { p_project: id })).rejects.toThrow(/ne prima/)
  })
})
