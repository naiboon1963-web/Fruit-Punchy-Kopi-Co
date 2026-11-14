import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const siteUrl = Deno.env.get('SITE_URL') || 'https://fruit-punchy-kopi-co.vercel.app'
const allowedOrigins = new Set([new URL(siteUrl).origin, ...(Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean)])

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin') || ''
  const cors = {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }
  const respond = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: cors })
  if (origin && !allowedOrigins.has(origin)) return respond(403, { error: 'This website is not allowed.' })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return respond(405, { error: 'Use POST.' })

  try {
    const authorization = request.headers.get('Authorization') || ''
    if (!authorization.startsWith('Bearer ')) return respond(401, { error: 'Sign in before inviting staff.' })
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
    // Do not trust a decoded JWT, browser metadata, or a requested role.
    const { data: { user }, error: userError } = await admin.auth.getUser(authorization.slice(7))
    if (userError || !user?.email_confirmed_at) return respond(401, { error: 'A verified sign-in is required.' })
    const { data: owner, error: roleError } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (roleError || owner?.role !== 'admin') return respond(403, { error: 'Only the café owner can invite staff.' })

    if (Number(request.headers.get('Content-Length') || 0) > 4096) return respond(413, { error: 'Request too large.' })
    const bodyText = await request.text()
    if (bodyText.length > 4096) return respond(413, { error: 'Request too large.' })
    let body: { email?: string; display_name?: string }
    try { body = JSON.parse(bodyText) } catch { return respond(400, { error: 'Invalid request.' }) }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !displayName || displayName.length > 100) return respond(400, { error: 'Enter a valid staff name and email.' })

    const { data: existing, error: lookupError } = await admin.from('profiles').select('id, role').eq('email', email).maybeSingle()
    if (lookupError) return respond(500, { error: 'Unable to check the account. Please retry.' })
    if (existing?.role === 'admin' || existing?.role === 'staff') return respond(409, { error: 'This account already has staff access.' })
    const { data: oldInvite } = await admin.from('staff_invitations').select('created_at').eq('email', email).maybeSingle()
    if (oldInvite && Date.now() - new Date(oldInvite.created_at).getTime() < 60_000) return respond(429, { error: 'Please wait a minute before sending another invitation.' })

    const { error: inviteRecordError } = await admin.from('staff_invitations').upsert({ email, display_name: displayName, invited_by: user.id, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), accepted_at: null })
    if (inviteRecordError) return respond(500, { error: 'Unable to save the invitation. Please retry.' })

    if (existing) {
      const { data: existingAuth, error: existingAuthError } = await admin.auth.admin.getUserById(existing.id)
      if (existingAuthError) return respond(500, { error: 'Unable to verify this account.' })
      if (existingAuth.user.email_confirmed_at) {
        const { error: promoteError } = await admin.from('profiles').update({ role: 'staff' }).eq('id', existing.id).eq('role', 'member')
        if (promoteError) return respond(500, { error: 'Unable to update staff access.' })
        await admin.from('staff_invitations').update({ accepted_at: new Date().toISOString() }).eq('email', email)
        return respond(200, { message: 'This existing member has already verified their email and now has staff access. They can sign in with their current password.' })
      }
      const { error: resendError } = await admin.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${siteUrl}/?account=callback` } })
      if (resendError) return respond(502, { error: 'Staff approval was saved, but the verification email could not be sent. Check Supabase email delivery settings and try again.' })
      return respond(200, { message: 'Verification email sent to the existing account. Staff access starts after they verify their email.' })
    }

    const { error: sendError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl}/?account=set-password`, data: { display_name: displayName } })
    if (sendError) return respond(502, { error: 'Staff approval was saved, but the invitation email could not be sent. Check the address and Supabase email delivery settings, then retry.' })
    return respond(200, { message: 'Invitation sent. The staff member must open their email link and choose a password. Staff access starts after email verification.' })
  } catch {
    return respond(500, { error: 'Unable to process this invitation. Please try again.' })
  }
})
