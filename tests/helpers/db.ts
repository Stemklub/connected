// Postgres u Node-u (PGlite) sa istim SQL-om kao Supabase (supabase/setup.sql).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
export const read = (p: string) => readFileSync(new URL(p, root), 'utf8')

export async function freshDb(opts: { mentor?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(read('tests/sql/supabase-stub.sql'))
  if (opts.mentor !== false) await addMentorUser(db)
  await db.exec(read('supabase/setup.sql'))
  return db
}

export async function addMentorUser(db: PGlite, nick = 'prof.e2e', password = 'demo1234') {
  await db.query(`insert into auth.users (email, encrypted_password) values ($1, $2) on conflict do nothing`, [
    `${nick}@connected.test`,
    password,
  ])
}

/** Novi anonimni korisnik (kao supabase.auth.signInAnonymously). */
export async function anonUser(db: PGlite): Promise<string> {
  const r = await db.query<{ id: string }>(`insert into auth.users (is_anonymous) values (true) returning id`)
  return r.rows[0].id
}

export async function mentorId(db: PGlite, nick = 'prof.e2e'): Promise<string> {
  const r = await db.query<{ id: string }>(`select id from auth.users where email = $1`, [`${nick}@connected.test`])
  return r.rows[0].id
}

/** SQL za poziv RPC funkcije sa imenovanim argumentima. */
export function rpcSql(fn: string, args: Record<string, unknown>) {
  const names = Object.keys(args)
  return {
    sql: `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`,
    params: names.map((n) => args[n]),
  }
}

/** Poziv RPC funkcije kao prijavljen korisnik (uloga authenticated) ili anon. */
export async function rpc<T = unknown>(db: PGlite, uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { sql, params } = rpcSql(fn, args)
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
    const res = await tx.query<{ r: T }>(sql, params)
    return res.rows[0].r
  })
}

/** Cijeli tok jednog učesnika: kod → nik → oznake. Vraća korisnika i odgovor save_interests. */
export async function newParticipant(db: PGlite, tags: string[], izvor = 'finale') {
  const uid = await anonUser(db)
  await rpc(db, uid, 'claim_demo_code', { p_izvor: izvor })
  const nicks = await rpc<string[]>(db, uid, 'suggest_nicks')
  await rpc(db, uid, 'set_nick', { p_nick: nicks[0] })
  const saved = await rpc<{ invite: Invite | null }>(db, uid, 'save_interests', { p_tags: tags })
  return { uid, nick: nicks[0], invite: saved.invite }
}

export interface Invite {
  id: string
  reason_tag: string | null
  status: string
  project: { id: string; title: string; tag: string | null; is_fallback: boolean; join_text: string }
}
