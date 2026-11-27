// Lažni Supabase za e2e testove: Auth (anonimno + lozinka) i PostgREST RPC nad PGlite-om
// sa ISTIM supabase/setup.sql. Realtime nije podržan (platno i admin tada osvježavaju sami).
//   npm run fake-supabase        (port 54321, ili FAKE_PORT)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { freshDb, rpcSql } from '../helpers/db'

const PORT = Number(process.env.FAKE_PORT ?? 54321)
const db = await freshDb()

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function jwt(uid: string, anon: boolean) {
  const now = Math.floor(Date.now() / 1000)
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', is_anonymous: anon, iat: now, exp: now + 3600 })}.fake`
}
function subOf(req: IncomingMessage): string | null {
  const h = req.headers.authorization ?? ''
  const tok = h.replace(/^Bearer /, '')
  try {
    const p = JSON.parse(Buffer.from(tok.split('.')[1] ?? '', 'base64url').toString())
    return typeof p.sub === 'string' ? p.sub : null
  } catch {
    return null
  }
}

async function userRow(uid: string) {
  const r = await db.query<{ id: string; email: string | null; is_anonymous: boolean; created_at: string }>(
    `select id, email, is_anonymous, created_at::text from auth.users where id = $1`,
    [uid],
  )
  return r.rows[0] ?? null
}
function userJson(u: { id: string; email: string | null; is_anonymous: boolean; created_at: string }) {
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email ?? '', is_anonymous: u.is_anonymous, app_metadata: {}, user_metadata: {}, created_at: u.created_at }
}
async function session(uid: string) {
  const u = (await userRow(uid))!
  return {
    access_token: jwt(uid, u.is_anonymous),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `rt.${uid}.${Date.now()}`,
    user: userJson(u),
  }
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-expose-headers': '*',
  })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let s = ''
  for await (const c of req) s += c
  return s ? JSON.parse(s) : {}
}

let queue: Promise<unknown> = Promise.resolve()
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = queue.then(fn, fn)
  queue = p.catch(() => {})
  return p
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x')
    if (req.method === 'OPTIONS') return send(res, 204)
    const path = url.pathname

    if (path === '/auth/v1/signup' && req.method === 'POST') {
      const body = await readBody(req)
      if (body.email) return send(res, 400, { code: 400, msg: 'Signups not allowed in fake server' })
      const uid = await serial(async () => (await db.query<{ id: string }>(`insert into auth.users (is_anonymous) values (true) returning id`)).rows[0].id)
      return send(res, 200, await session(uid))
    }
    if (path === '/auth/v1/token' && req.method === 'POST') {
      const body = await readBody(req)
      if (url.searchParams.get('grant_type') === 'password') {
        const r = await db.query<{ id: string }>(`select id from auth.users where lower(email) = lower($1) and encrypted_password = $2`, [body.email, body.password])
        if (!r.rows[0]) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
        return send(res, 200, await session(r.rows[0].id))
      }
      const uid = String(body.refresh_token ?? '').split('.')[1]
      if (!uid || !(await userRow(uid))) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' })
      return send(res, 200, await session(uid))
    }
    if (path === '/auth/v1/user') {
      const uid = subOf(req)
      const u = uid && (await userRow(uid))
      if (!u) return send(res, 401, { code: 401, msg: 'User not found' })
      return send(res, 200, userJson(u))
    }
    if (path === '/auth/v1/logout') return send(res, 204)

    const m = path.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)
    if (m && (req.method === 'POST' || req.method === 'GET')) {
      const args = req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams)
      const uid = subOf(req)
      try {
        const r = await serial(() =>
          db.transaction(async (tx) => {
            await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
            await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
            const { sql, params } = rpcSql(m[1], args)
            return (await tx.query<{ r: unknown }>(sql, params)).rows[0]?.r ?? null
          }),
        )
        return send(res, 200, r)
      } catch (e) {
        const err = e as { message: string; code?: string; hint?: string; detail?: string }
        return send(res, err.code === '42501' ? 403 : 400, { code: err.code ?? 'P0001', message: err.message, hint: err.hint ?? null, details: err.detail ?? null })
      }
    }
    send(res, 404, { message: 'not found: ' + path })
  } catch (e) {
    send(res, 500, { message: (e as Error).message })
  }
}).listen(PORT, () => console.log(`fake supabase na http://localhost:${PORT}`))
