// Supabase klijent i RPC pozivi. Sve izmjene idu kroz RPC funkcije (supabase/setup.sql).
// Telefoni NE otvaraju Realtime websocket: poziv stiže kao odgovor na „Gotovo“ (save_interests).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const hasConfig = !!(URL_ && KEY)
export const AUTH_EMAIL_DOMAIN = (import.meta.env.VITE_AUTH_EMAIL_DOMAIN as string | undefined) || 'connected.test'

let client: SupabaseClient | null = null
export function sb(): SupabaseClient {
  if (!client) {
    if (!URL_ || !KEY) throw new ApiError('Aplikacija nije povezana sa serverom (nedostaju VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY).')
    client = createClient(URL_, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ce2-auth' },
    })
  }
  return client
}

export class ApiError extends Error {
  hint: string | null
  constructor(message: string, hint: string | null = null) {
    super(message)
    this.hint = hint
  }
}

function friendly(msg: string): string {
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)) return 'Nema veze sa serverom. Provjeri internet pa probaj ponovo.'
  if (/rate limit|too many/i.test(msg)) return 'Previše prijava u isto vrijeme. Sačekaj par sekundi pa probaj ponovo.'
  if (/Anonymous sign-ins are disabled/i.test(msg)) return 'Server ne dozvoljava anonimnu prijavu (README → Supabase podešavanja).'
  if (/Invalid login credentials/i.test(msg)) return 'Nik ili lozinka nisu tačni.'
  if (/JWT expired/i.test(msg)) return 'Sesija je istekla. Osvježi stranicu.'
  return msg
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args)
  if (error) {
    const hint = error.hint?.startsWith('ce:') ? error.hint.slice(3) : null
    throw new ApiError(friendly(error.message), hint)
  }
  return data as T
}

// ── Tipovi odgovora ──────────────────────────────────────────

export interface Me {
  id: string
  nick: string | null
  role: 'student' | 'mentor'
  code: string | null
  tags: string[]
}

export interface Project {
  id: string
  title: string
  sentence: string
  deadline: string | null
  tag: string | null
  join_text: string
  status: 'pending' | 'open' | 'rejected'
  is_fallback: boolean
  member_count: number
  members: string[]
  is_member: boolean
  /** Ime nastavnika; upisuje admin. Starija baza (prije zakrpe) ga nema. */
  mentor?: string | null
}

export interface Invite {
  id: string
  reason_tag: string | null
  status: 'pending' | 'accepted' | 'declined'
  project: Project
}

export interface ForYou {
  invite: Invite | null
  matches: Project[]
  others: Project[]
}

export interface Proposal {
  id: string
  title: string
  sentence: string
  tag: string | null
  status: 'pending' | 'rejected'
}

export interface MyTeams {
  teams: Project[]
  proposals: Proposal[]
}

export interface TeamDetail {
  project: Project
  members: { nick: string; me: boolean }[]
}

export interface WallItem {
  id: number
  nick: string
  text: string
  at: string
}

export interface Screen {
  registrations_open: boolean
  people: number
  joined: number
  teams: { id: string; title: string; tag: string | null; is_fallback: boolean; members: number }[]
  wall: WallItem[]
}

export interface AdminData {
  nick: string
  registrations_open: boolean
  reset_at: string
  codes_free: number
  codes_used: number
  proposals: { id: string; title: string; sentence: string; tag: string | null; nick: string | null; created_at: string }[]
  /** Starija baza (prije zakrpe za mentore) ga nema. */
  teams?: { id: string; title: string; tag: string | null; is_fallback: boolean; mentor: string | null; members: number }[]
  screen: Screen
}

export interface StandRow {
  izvor: string
  prijave: number
  pridruzivanja: number
}

// ── Sesija ───────────────────────────────────────────────────

async function hasSession(): Promise<boolean> {
  const { data } = await sb().auth.getSession()
  return !!data.session
}

/** Profil za sačuvanu sesiju, ili null (nema sesije, ili je demo resetovan). */
export async function loadMe(): Promise<Me | null> {
  if (!hasConfig || !(await hasSession())) return null
  try {
    const me = await rpc<Me | null>('get_me')
    if (!me) await sb().auth.signOut({ scope: 'local' }).catch(() => {})
    return me
  } catch (e) {
    if (e instanceof ApiError && /Sesija je istekla/.test(e.message)) {
      await sb().auth.signOut({ scope: 'local' }).catch(() => {})
      return null
    }
    throw e
  }
}

/** „Uđi“: anonimni nalog bez kucanja + jedan kod iz bazena. Osvježavanje ne pravi novi nalog. */
export async function enter(izvor: string): Promise<Me> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await hasSession())) {
      const { error } = await sb().auth.signInAnonymously()
      if (error) throw new ApiError(friendly(error.message))
    }
    try {
      return await rpc<Me>('claim_demo_code', { p_izvor: izvor })
    } catch (e) {
      // Nalog obrisan resetom dok je sesija još u pregledaču → nova anonimna sesija.
      if (e instanceof ApiError && (e.hint === 'stale' || e.hint === 'no_session') && attempt === 0) {
        await sb().auth.signOut({ scope: 'local' }).catch(() => {})
        continue
      }
      throw e
    }
  }
  throw new ApiError('Prijava nije uspjela. Osvježi stranicu.')
}

/** „Imam kod“: nastavi nalog sa drugog uređaja. */
export async function redeemCode(code: string): Promise<Me> {
  if (!(await hasSession())) {
    const { error } = await sb().auth.signInAnonymously()
    if (error) throw new ApiError(friendly(error.message))
  }
  const r = await rpc<Me & { error?: string }>('redeem_code', { p_code: code })
  if (r.error) throw new ApiError(r.error)
  return r
}

export const nickToEmail = (nick: string) => `${nick.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`

/** Prijava mentora nikom i lozinkom (sintetički email nik@connected.test). */
export async function mentorLogin(nick: string, password: string): Promise<Me> {
  await sb().auth.signOut({ scope: 'local' }).catch(() => {})
  const { error } = await sb().auth.signInWithPassword({ email: nickToEmail(nick), password })
  if (error) throw new ApiError(friendly(error.message))
  const me = await rpc<Me | null>('get_me')
  if (!me || me.role !== 'mentor') {
    await sb().auth.signOut({ scope: 'local' }).catch(() => {})
    throw new ApiError('Ovaj nalog nema mentorska prava.')
  }
  return me
}

export async function logout() {
  await sb().auth.signOut({ scope: 'local' }).catch(() => {})
}

// ── Realtime (samo platno i admin) ───────────────────────────

/** Javlja svaku promjenu na zidu (novi događaj ili reset). Vraća funkciju za odjavu. */
export function watchWall(onChange: () => void, onStatus?: (live: boolean) => void): () => void {
  const ch = sb()
    .channel('ce2-wall')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'demo_events' }, () => onChange())
    .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'))
  return () => {
    void sb().removeChannel(ch)
  }
}
