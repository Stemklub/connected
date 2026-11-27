// Load test: N klijenata istovremeno prolazi cijeli tok kao telefoni u sali:
//   anonimna prijava → kod → nik → oznake („Gotovo“) → poziv → prihvati
// Mjeri vrijeme do poziva (odgovor na „Gotovo“) i cijeli tok. Cilj: p95 vremena do poziva < 3 s.
//
//   SUPABASE_URL=https://<projekat>.supabase.co SUPABASE_ANON_KEY=<publishable> npm run load-test
//   Opcije (env): N=100  RAMP_MS=2000  MENTOR_NICK=prof.e2e  MENTOR_PASS=demo1234
//                 RESET=before|after|both|none (podrazumijevano both)  P95_LIMIT_MS=3000
// Prije testa: Supabase → Authentication → anonimne prijave UKLJUČENE i rate limit podignut (README).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TAGS } from '../src/config/demo'

const URL_ = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const N = Number(process.env.N ?? 100)
const RAMP_MS = Number(process.env.RAMP_MS ?? 2000)
const RESET = process.env.RESET ?? 'both'
const P95_LIMIT = Number(process.env.P95_LIMIT_MS ?? 3000)
const MENTOR_NICK = process.env.MENTOR_NICK ?? 'prof.e2e'
const MENTOR_PASS = process.env.MENTOR_PASS ?? 'demo1234'
const DOMAIN = process.env.AUTH_EMAIL_DOMAIN ?? 'connected.test'

if (!URL_ || !KEY) {
  console.error('Postavi SUPABASE_URL i SUPABASE_ANON_KEY.')
  process.exit(2)
}

const client = () =>
  createClient(URL_!, KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })

async function call<T>(sb: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

async function mentorReset(label: string) {
  const sb = client()
  const { error } = await sb.auth.signInWithPassword({ email: `${MENTOR_NICK}@${DOMAIN}`, password: MENTOR_PASS })
  if (error) throw new Error(`Mentor prijava: ${error.message}`)
  const r = await call<{ projects: number; codes_free: number }>(sb, 'reset_demo')
  console.log(`reset (${label}): ${r.projects} projekata, ${r.codes_free} slobodnih kodova`)
  if (r.codes_free < N) {
    const g = await call<{ codes_free: number }>(sb, 'generate_codes', { p_n: N - r.codes_free + 10 })
    console.log(`dodati kodovi → ${g.codes_free} slobodnih`)
  }
}

function pickTags(i: number): string[] {
  const k = 1 + (i % 4)
  const slugs = TAGS.map((t) => t.slug)
  const start = (i * 3) % slugs.length
  return Array.from({ length: k }, (_, j) => slugs[(start + j * 3) % slugs.length])
}

type Result = { ok: true; steps: Record<string, number>; toInvite: number; total: number; fallback: boolean } | { ok: false; step: string; error: string }

async function participant(i: number): Promise<Result> {
  const sb = client()
  const steps: Record<string, number> = {}
  let step = 'signInAnonymously'
  const timed = async <T>(name: string, fn: () => Promise<T>) => {
    step = name
    const t = performance.now()
    const r = await fn()
    steps[name] = performance.now() - t
    return r
  }
  const t0 = performance.now()
  try {
    await timed('signInAnonymously', async () => {
      const { error } = await sb.auth.signInAnonymously()
      if (error) throw new Error(error.message)
    })
    await timed('claim_demo_code', () => call(sb, 'claim_demo_code', { p_izvor: i % 5 === 0 ? 'stand' : 'finale' }))
    let nicks = await timed('suggest_nicks', () => call<string[]>(sb, 'suggest_nicks'))
    await timed('set_nick', async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await call(sb, 'set_nick', { p_nick: nicks[(i + attempt) % nicks.length] })
        } catch (e) {
          if (attempt >= 5 || !/uzeo/.test((e as Error).message)) throw e
          nicks = await call<string[]>(sb, 'suggest_nicks')
        }
      }
    })
    const saved = await timed('save_interests', () =>
      call<{ invite: { id: string; project: { is_fallback: boolean } } | null }>(sb, 'save_interests', { p_tags: pickTags(i) }),
    )
    if (!saved.invite) throw new Error('save_interests nije vratio poziv')
    await timed('respond_invite', () => call(sb, 'respond_invite', { p_invite: saved.invite!.id, p_accept: true }))
    return { ok: true, steps, toInvite: steps.save_interests, total: performance.now() - t0, fallback: saved.invite.project.is_fallback }
  } catch (e) {
    return { ok: false, step, error: (e as Error).message }
  }
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? NaN
}
const ms = (x: number) => `${Math.round(x)} ms`

async function main() {
  console.log(`ConnectEd load test: ${N} klijenata, ramp ${RAMP_MS} ms, ${URL_}`)
  if (RESET === 'before' || RESET === 'both') await mentorReset('prije')

  const t0 = performance.now()
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) => new Promise<Result>((res) => setTimeout(() => participant(i).then(res), (i / N) * RAMP_MS))),
  )
  const wall = performance.now() - t0

  const ok = results.filter((r): r is Extract<Result, { ok: true }> => r.ok)
  const bad = results.filter((r): r is Extract<Result, { ok: false }> => !r.ok)
  console.log(`\nUspješno: ${ok.length}/${N} za ${ms(wall)} (rezervni poziv: ${ok.filter((r) => r.fallback).length})`)
  if (ok.length) {
    const rows = ['signInAnonymously', 'claim_demo_code', 'suggest_nicks', 'set_nick', 'save_interests', 'respond_invite']
    console.log('\nkorak                 p50       p95       max')
    for (const k of rows) {
      const xs = ok.map((r) => r.steps[k])
      console.log(`${k.padEnd(20)} ${ms(pct(xs, 50)).padStart(8)}  ${ms(pct(xs, 95)).padStart(8)}  ${ms(Math.max(...xs)).padStart(8)}`)
    }
    const total = ok.map((r) => r.total)
    console.log(`${'cijeli tok'.padEnd(20)} ${ms(pct(total, 50)).padStart(8)}  ${ms(pct(total, 95)).padStart(8)}  ${ms(Math.max(...total)).padStart(8)}`)
  }
  if (bad.length) {
    console.log('\nGreške:')
    const groups = new Map<string, number>()
    for (const b of bad) groups.set(`${b.step}: ${b.error}`, (groups.get(`${b.step}: ${b.error}`) ?? 0) + 1)
    for (const [k, v] of groups) console.log(`  ${v}× ${k}`)
  }

  const p95 = ok.length ? pct(ok.map((r) => r.toInvite), 95) : Infinity
  const pass = bad.length === 0 && p95 < P95_LIMIT
  console.log(`\np95 vremena do poziva: ${ms(p95)} (cilj < ${P95_LIMIT} ms) → ${pass ? 'PROŠAO' : 'PAO'}`)

  if (RESET === 'after' || RESET === 'both') await mentorReset('poslije')
  process.exit(pass ? 0 : 1)
}

void main()
