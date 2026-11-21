import { createClient } from 'npm:@supabase/supabase-js@2.119.2'

const pendingMessage = 'Your account is pending approval. Please contact the café team.'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function handleMemberAuth(request: Request) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed.' })
  try {
    if (Number(request.headers.get('content-length') || 0) > 8192) return reply(413, { error: 'Request too large.' })
    const raw = await request.text()
    if (raw.length > 8192) return reply(413, { error: 'Request too large.' })
    let body
    try { body = JSON.parse(raw) } catch { return reply(400, { error: 'Invalid request.' }) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Invalid request.' })
    const url = Deno.env.get('SUPABASE_URL')
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const siteUrl = Deno.env.get('MEMBER_SITE_URL')
    if (!url || !publicKey || !serviceKey || !siteUrl) return reply(503, { error: 'Member services are not configured yet.' })
    const options = { auth: { persistSession: false, autoRefreshToken: false } }
    const admin = createClient(url, serviceKey, options)
    const client = createClient(url, publicKey, options)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (body.action === 'reset') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply(400, { error: 'Enter a valid email address.' })
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: new URL('/?account=reset', siteUrl).toString() })
      if (error) return reply(error.status === 429 ? 429 : 400, { error: 'Unable to send a reset email. Please try again later.' })
      return reply(200, { success: true })
    }
    if (!['register', 'login', 'staff-login'].includes(body.action) || !/^[a-z0-9_]{3,30}$/.test(username) || !password || password.length > 128) return reply(400, { error: 'Enter a valid username and password.' })
    if (body.action === 'register') {
      const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
      const telephone = typeof body.telephone === 'string' ? body.telephone.trim() : ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !fullName || fullName.length > 100 || !/^[+()\d .-]{6,30}$/.test(telephone) || password.length < 12) return reply(400, { error: 'Enter your full name, a valid email and telephone number, and a password of at least 12 characters.' })
      const { data: existing, error: lookupError } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
      if (lookupError) return reply(503, { error: 'Member services are temporarily unavailable.' })
      if (existing) return reply(409, { error: 'This login username is already registered. Please choose another.' })
      const { error } = await client.auth.signUp({ email, password, options: { data: { username, full_name: fullName, telephone }, emailRedirectTo: new URL('/?account=callback', siteUrl).toString() } })
      if (error) {
        // The unique database constraint also handles simultaneous registrations.
        const { data: duplicate } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
        if (duplicate) return reply(409, { error: 'This login username is already registered. Please choose another.' })
        return reply(error.status === 429 ? 429 : 400, { error: 'Registration could not be completed. Please try again later or contact the café team.' })
      }
      return reply(200, { success: true, status: 'Pending' })
    }
    const { data: member, error: lookupError } = await admin.from('profiles').select('id, email').eq('username', username).maybeSingle()
    if (lookupError) return reply(503, { error: 'Member services are temporarily unavailable.' })
    // Attempt authentication even for unknown usernames, using an ineligible address.
    const { data, error } = await client.auth.signInWithPassword({ email: member?.email || 'unknown-member@invalid.example', password })
    if (error || !data.session || !member || data.user.id !== member.id) return reply(401, { error: 'The username or password is incorrect.' })
    // Read approval after password verification. No tokens leave this endpoint
    // until the server confirms the current approval status.
    const { data: profile, error: statusError } = await admin.from('profiles').select('status, username, full_name, role').eq('id', member.id).single()
    if (statusError || profile.status !== 'Active') {
      await client.auth.signOut()
      return reply(403, { error: profile?.status === 'Pending' ? pendingMessage : 'Your membership is not active. Please contact the café team.' })
    }
    if (body.action === 'staff-login' && !['staff', 'admin'].includes(profile.role)) {
      await client.auth.signOut()
      return reply(403, { error: 'Staff access is required. Please use member login or contact the café team.' })
    }
    return reply(200, { session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } })
  } catch { return reply(500, { error: 'Unable to complete your request. Please try again.' }) }
}

Deno.serve(handleMemberAuth)
