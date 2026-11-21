import { createClient } from 'npm:@supabase/supabase-js@2.119.2'

const encoder = new TextEncoder()
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))

async function passwordMatches(password: string, hash: string) {
  const [algorithm, rounds, salt, expected] = hash.split(':')
  if (algorithm !== 'pbkdf2-sha256' || rounds !== '210000' || !salt || !expected) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: decode(salt), iterations: 210000 }, key, 256))
  const target = decode(expected)
  let difference = actual.length ^ target.length
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ (target[i] || 0)
  return difference === 0
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function issueToken(secret: string) {
  const expires = Math.floor(Date.now() / 1000) + 900
  const payload = encode(encoder.encode(JSON.stringify({ scope: 'member-admin', exp: expires, nonce: crypto.randomUUID() })))
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload)))
  return { token: payload + '.' + encode(signature), expires_at: expires * 1000 }
}

async function validToken(token: unknown, secret: string) {
  if (typeof token !== 'string' || token.length > 1024) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return false
    if (!await crypto.subtle.verify('HMAC', await signingKey(secret), decode(parts[1]), encoder.encode(parts[0]))) return false
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])))
    const now = Math.floor(Date.now() / 1000)
    return payload.scope === 'member-admin' && Number.isInteger(payload.exp) && payload.exp > now && payload.exp <= now + 900
  } catch { return false }
}

Deno.serve(async (request: Request) => {
  const site = Deno.env.get('MEMBER_SITE_URL') || 'https://fruit-punchy-kopi-co.vercel.app'
  const origin = request.headers.get('Origin') || ''
  const origins = new Set([new URL(site).origin, 'https://fruit-punchy-kopi-co-nbkoh.vercel.app', ...(Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '').split(',').filter(Boolean)])
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    'Access-Control-Allow-Origin': origins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers })
  if (origin && !origins.has(origin)) return reply(403, { error: 'This website is not allowed.' })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' })
  try {
    if (Number(request.headers.get('content-length') || 0) > 4096) return reply(413, { error: 'Request too large.' })
    const text = await request.text()
    if (text.length > 4096) return reply(413, { error: 'Request too large.' })
    let body
    try { body = JSON.parse(text) } catch { return reply(400, { error: 'Invalid request.' }) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Invalid request.' })
    const secret = Deno.env.get('ADMIN_SESSION_SECRET') || ''
    const hash = Deno.env.get('ADMIN_PASSWORD_HASH') || ''
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (secret.length < 32 || !hash || !url || !key) return reply(503, { error: 'Administration is not configured yet.' })
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    if (body.action === 'login') {
      if (typeof body.password !== 'string' || !body.password || body.password.length > 128) return reply(400, { error: 'Enter your admin password.' })
      // A database counter survives cold starts. Hash the network identity rather
      // than storing IP addresses. Unknown network identities share one bucket.
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      const bucket = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret + ':' + ip))))
      const { data: allowed, error: limitError } = await admin.rpc('consume_admin_login_attempt', { bucket_key: bucket })
      if (limitError) return reply(503, { error: 'Administration is temporarily unavailable.' })
      if (!allowed) return reply(429, { error: 'Too many admin login attempts. Try again in 15 minutes.' })
      if (!await passwordMatches(body.password, hash)) return reply(401, { error: 'The admin password is incorrect.' })
      return reply(200, await issueToken(secret))
    }
    if (!await validToken(body.admin_token, secret)) return reply(401, { error: 'Your admin session has expired. Please unlock administration again.' })
    if (body.action === 'list') {
      const page = Number.isInteger(body.page) && body.page >= 0 && body.page <= 10000 ? body.page : 0
      const status = ['Pending', 'Active', 'Rejected'].includes(body.status) ? body.status : null
      let query = admin.from('profiles').select('id, username, full_name, email, telephone, role, status, created_at', { count: 'exact' })
      if (status) query = query.eq('status', status)
      const { data, count, error } = await query.order('created_at', { ascending: false }).order('id').range(page * 25, page * 25 + 24)
      if (error) return reply(503, { error: 'Unable to load members. Please retry.' })
      return reply(200, { members: data, total: count, page })
    }
    if (!['approve', 'promote', 'set-password'].includes(body.action) || typeof body.member_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.member_id)) return reply(400, { error: 'Choose a valid member and action.' })
    if (body.action === 'set-password') {
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) return reply(400, { error: 'Choose a new password of 12–128 characters.' })
      const { data: member, error: lookupError } = await admin.from('profiles').select('id, role').eq('id', body.member_id).maybeSingle()
      if (lookupError) return reply(503, { error: 'Unable to check this member. Please retry.' })
      if (!member || !['member', 'staff'].includes(member.role)) return reply(404, { error: 'Choose an existing member or staff account.' })
      const { error: passwordError } = await admin.auth.admin.updateUserById(member.id, { password: body.password })
      if (passwordError) return reply(400, { error: 'Unable to set the password. It must meet the project password requirements.' })
      return reply(200, { message: 'Password updated. The account must be approved before sign-in.' })
    }
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : null
    if (username !== null && !/^[a-z0-9_]{3,30}$/.test(username)) return reply(400, { error: 'Usernames need 3–30 letters, numbers or underscores.' })
    const { data, error } = await admin.rpc('admin_manage_member', { target_id: body.member_id, requested_action: body.action, assigned_username: username })
    if (error) {
      const messages: Record<string, string> = {
        '23505': 'That username is already in use.',
        'P0002': 'This member could not be found.',
        '22023': 'Assign a username before approval. Only active members can be promoted to staff.',
      }
      return reply(error.code === 'P0002' ? 404 : 409, { error: messages[error.code] || 'Unable to update this member. Refresh and try again.' })
    }
    return reply(200, { member: data, message: body.action === 'approve' ? 'Member approved. They can now sign in with their username and password.' : 'Member upgraded to staff.' })
  } catch { return reply(500, { error: 'Unable to complete the admin request. Please retry.' }) }
})
