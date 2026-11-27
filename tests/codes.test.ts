// Kodovi: atomičnost, zatvorene prijave, „Imam kod“, izvor.
import { describe, expect, it } from 'vitest'
import pg from 'pg'
import { anonUser, freshDb, mentorId, newParticipant, read, rpc } from './helpers/db'

type Me = { id: string; nick: string | null; code: string; tags: string[] }

describe('kodovi', () => {
  it('svaki nalog dobija drugi kod; ponovni poziv vraća isti nalog', async () => {
    const db = await freshDb()
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const u = await anonUser(db)
      const me = await rpc<Me>(db, u, 'claim_demo_code', { p_izvor: 'finale' })
      expect(seen.has(me.code)).toBe(false)
      seen.add(me.code)
      const again = await rpc<Me>(db, u, 'claim_demo_code', { p_izvor: 'finale' })
      expect(again.id).toBe(me.id)
      expect(again.code).toBe(me.code)
    }
    const used = await db.query<{ n: number }>(`select count(*)::int as n from demo_codes where used_at is not null`)
    expect(used.rows[0].n).toBe(50)
  })

  it('zatvorene prijave i potrošeni kodovi daju jasnu poruku', async () => {
    const db = await freshDb()
    const m = await mentorId(db)
    await rpc(db, m, 'set_registrations', { p_open: false })
    await expect(rpc(db, await anonUser(db), 'claim_demo_code', {})).rejects.toThrow(/Prijave su trenutno zatvorene/)
    await rpc(db, m, 'set_registrations', { p_open: true })
    await db.exec(`update demo_codes set used_at = now()`)
    await expect(rpc(db, await anonUser(db), 'claim_demo_code', {})).rejects.toThrow(/Sva mjesta su popunjena/)
    const r = await rpc<{ made: number; codes_free: number }>(db, m, 'generate_codes', { p_n: 5 })
    expect(r.made).toBe(5)
    expect(r.codes_free).toBe(5)
    await rpc(db, await anonUser(db), 'claim_demo_code', {})
  })

  it('„Imam kod“ prebacuje nalog na novi uređaj; pogrešan kod ne prolazi', async () => {
    const db = await freshDb()
    const a = await newParticipant(db, ['robotika'])
    const meA = await rpc<Me>(db, a.uid, 'get_me')
    const phone2 = await anonUser(db)
    await rpc(db, phone2, 'claim_demo_code', {}) // novi uređaj je već dobio svoj (prazan) nalog
    const bad = await rpc<{ error?: string }>(db, phone2, 'redeem_code', { p_code: 'ZZZZZ' })
    expect(bad.error).toMatch(/ne postoji/)
    const moved = await rpc<Me>(db, phone2, 'redeem_code', { p_code: meA.code.toLowerCase().split('').join(' ') })
    expect(moved.id).toBe(meA.id)
    expect(moved.nick).toBe(meA.nick)
    expect(moved.tags).toEqual(['robotika'])
    // stari uređaj više nema nalog
    expect(await rpc(db, a.uid, 'get_me')).toBeNull()
    // prazan nalog sa novog uređaja je obrisan, a njegov kod oslobođen
    const n = await db.query<{ n: number }>(`select count(*)::int as n from profiles where role = 'student'`)
    expect(n.rows[0].n).toBe(1)
  })

  it('previše pogrešnih kodova → pauza', async () => {
    const db = await freshDb()
    const u = await anonUser(db)
    for (let i = 0; i < 10; i++) await rpc(db, u, 'redeem_code', { p_code: 'XXXXX' })
    await expect(rpc(db, u, 'redeem_code', { p_code: 'XXXXX' })).rejects.toThrow(/Previše pokušaja/)
  })

  it('izvor stand/finale se bilježi; CSV broji prijave i pridruživanja bez nikova', async () => {
    const db = await freshDb()
    for (let i = 0; i < 3; i++) {
      const p = await newParticipant(db, ['nauka'], 'stand')
      if (i < 2) await rpc(db, p.uid, 'respond_invite', { p_invite: p.invite!.id, p_accept: true })
    }
    await newParticipant(db, ['muzika'], 'finale')
    await newParticipant(db, ['muzika'], 'nešto-drugo')
    const rows = await rpc<{ izvor: string; prijave: number; pridruzivanja: number }[]>(db, await mentorId(db), 'export_stand_stats')
    expect(rows).toEqual([
      { izvor: 'stand', prijave: 3, pridruzivanja: 2 },
      { izvor: 'finale', prijave: 2, pridruzivanja: 0 },
    ])
    expect(JSON.stringify(rows)).not.toMatch(/nick/)
  })
})

// Prava istovremenost: više konekcija na lokalni Postgres (PG_TEST_URL), npr. u CI-ju.
const PG = process.env.PG_TEST_URL
describe.skipIf(!PG)('kodovi pod opterećenjem (pravi Postgres)', () => {
  it('100 istovremenih claim_demo_code: 100 različitih kodova', async () => {
    const admin = new pg.Client({ connectionString: PG })
    await admin.connect()
    const dbName = 'ce_codes_' + Date.now()
    await admin.query(`create database ${dbName}`)
    const url = new URL(PG!)
    url.pathname = '/' + dbName
    const setup = new pg.Client({ connectionString: url.toString() })
    await setup.connect()
    await setup.query(read('tests/sql/supabase-stub.sql'))
    await setup.query(read('supabase/setup.sql'))
    const users = (await setup.query<{ id: string }>(`insert into auth.users (is_anonymous) select true from generate_series(1, 100) returning id`)).rows
    const pool = new pg.Pool({ connectionString: url.toString(), max: 50 })
    const codes = await Promise.all(
      users.map(async (u) => {
        const c = await pool.connect()
        try {
          await c.query('begin')
          await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [u.id])
          await c.query('set local role authenticated')
          const r = await c.query<{ r: { code: string } }>(`select public.claim_demo_code('finale') as r`)
          await c.query('commit')
          return r.rows[0].r.code
        } finally {
          c.release()
        }
      }),
    )
    expect(new Set(codes).size).toBe(100)
    const used = await setup.query<{ n: number }>(`select count(*)::int as n from demo_codes where used_at is not null`)
    expect(used.rows[0].n).toBe(100)
    await pool.end()
    await setup.end()
    await admin.query(`drop database ${dbName}`)
    await admin.end()
  }, 60_000)
})
