// Nadogradnja v1 → v2 nad pravom v1 bazom (tests/fixtures/v1-setup.sql = setup.sql sa taga v1-demo).
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { buildUpgrade } from '../scripts/gen-upgrade'
import { TAGS } from '../src/config/demo'
import { freshDb, newParticipant, read, rpc } from './helpers/db'

describe('nadogradnja v1 → v2', () => {
  it('supabase/nadogradnja-v1-v2.sql je ažuran (npm run gen:upgrade)', () => {
    expect(read('supabase/nadogradnja-v1-v2.sql')).toBe(buildUpgrade(read('supabase/setup.sql')))
  })

  it('briše v1, čuva mentora prof.e2e i njegov auth nalog, i v2 radi', async () => {
    const db = new PGlite()
    await db.exec(read('tests/sql/supabase-stub.sql'))
    await db.exec(read('tests/fixtures/v1-setup.sql'))
    const mentor = (await db.query<{ id: string }>(
      `insert into auth.users (email, encrypted_password) values ('prof.e2e@connected.test', 'demo1234') returning id`,
    )).rows[0].id
    const student = (await db.query<{ id: string }>(`insert into auth.users (email) values ('ucenik@connected.test') returning id`)).rows[0].id
    await db.query(`insert into public.profiles (user_id, nick, nick_norm, role) values ($1, 'prof.e2e', 'prof.e2e', 'mentor')`, [mentor])
    await db.query(`insert into public.profiles (user_id, nick, nick_norm, role, class_id) values ($1, 'ucenik', 'ucenik', 'student', '3-2')`, [student])

    await db.exec(read('supabase/nadogradnja-v1-v2.sql'))

    const users = await db.query<{ email: string }>(`select email from auth.users`)
    expect(users.rows.map((u) => u.email)).toEqual(['prof.e2e@connected.test'])
    const tables = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    )
    expect(tables.rows.map((t) => t.table_name)).toEqual([
      'demo_codes', 'demo_events', 'demo_settings', 'invites', 'memberships', 'profile_tags', 'profiles', 'projects', 'tags',
    ])
    const types = await db.query(`select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'`)
    expect(types.rows).toHaveLength(0)
    const adm = await rpc<{ nick: string; codes_free: number }>(db, mentor, 'get_admin')
    expect(adm).toMatchObject({ nick: 'prof.e2e', codes_free: 300 })
    const p = await newParticipant(db, ['robotika'])
    expect(p.invite).not.toBeNull()

    // ponovno pokretanje (npr. ako je prvi put stalo na pola) ne smije pući ni izgubiti mentora
    await db.exec(read('supabase/nadogradnja-v1-v2.sql'))
    expect((await rpc<{ nick: string }>(db, mentor, 'get_admin')).nick).toBe('prof.e2e')
    expect(await db.query(`select 1 from information_schema.tables where table_name = 'ce_keep_mentors'`)).toMatchObject({ rows: [] })
    await rpc(db, mentor, 'reset_demo')
  }, 60_000)
})

describe('konfiguracija', () => {
  it('oznake u SQL-u su iste kao u src/config/demo.ts', async () => {
    const db = await freshDb()
    const r = await db.query<{ slug: string; label: string; icon: string }>(`select slug, label, icon from public.tags order by sort`)
    expect(r.rows).toEqual(TAGS.map((t) => ({ slug: t.slug, label: t.label, icon: t.icon })))
  })

  it('svaka oznaka ima bar jedan otvoren projekat, plus rezervni', async () => {
    const db = await freshDb()
    const r = await db.query<{ tag: string | null }>(`select tag from public.projects where status = 'open'`)
    for (const t of TAGS) expect(r.rows.map((x) => x.tag)).toContain(t.slug)
    expect(r.rows.map((x) => x.tag)).toContain(null)
  })
})

describe('zakrpa kratkih nikova', () => {
  it('nad v2 bazom sa starim nikovima radi i nudi nove', async () => {
    const db = await freshDb()
    await db.exec(read('supabase/zakrpa-kratki-nikovi.sql'))
    await db.exec(read('supabase/zakrpa-kratki-nikovi.sql'))
    const p = await newParticipant(db, ['robotika'])
    expect(p.nick).toMatch(/^[A-ZČĆŠŽĐ][a-zčćšžđ]+$/)
    // svaka funkcija iz zakrpe je ista kao u setup.sql
    const setup = read('supabase/setup.sql')
    for (const fn of read('supabase/zakrpa-kratki-nikovi.sql').split(/(?=create or replace function)/).slice(1)) {
      expect(setup).toContain(fn.trim())
    }
  })
})
