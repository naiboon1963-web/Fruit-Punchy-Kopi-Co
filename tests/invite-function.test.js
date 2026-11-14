import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createHash, webcrypto } from 'node:crypto'

const testCode = 'test-staff-code-only'
const testCodeHash = createHash('sha256').update(testCode).digest('hex')

async function handlerFor({ user = null, role = 'member', inviteResult = { error: null }, oldInvite = null, codeHash = testCodeHash } = {}) {
  let handler
  let sends = 0
  let writes = 0
  const query = (table) => {
    const builder = {
      select() { return this }, eq() { return this },
      single: async () => ({ data: { role }, error: null }),
      maybeSingle: async () => ({ data: table === 'staff_invitations' ? oldInvite : null, error: null }),
      upsert: async () => { writes++; return { error: null } },
    }
    return builder
  }
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'Invalid JWT' } }), admin: { inviteUserByEmail: async () => { sends++; return inviteResult } } },
    from: query,
  }
  const code = (await readFile(new URL('../supabase/functions/invite-staff/index.ts', import.meta.url), 'utf8')).replace(/^import .*\n/, '')
  vm.runInNewContext(stripTypeScriptTypes(code), {
    createClient: () => client,
    Deno: { env: { get: (key) => key === 'SITE_URL' ? 'https://fruit-punchy-kopi-co.vercel.app' : key === 'STAFF_CREATION_CODE_HASH' ? codeHash : 'test' }, serve: (fn) => { handler = fn } },
    URL, Response, Request, Date, Set, JSON, crypto: webcrypto, TextEncoder, Uint8Array,
  })
  return { handler, counts: () => ({ sends, writes }) }
}

const verified = { id: 'owner-id', email_confirmed_at: '2026-11-14T00:00:00Z' }
function request({ token = 'valid-token', origin = 'https://fruit-punchy-kopi-co.vercel.app', body = { email: 'staff@example.test', display_name: 'Staff', authorization_code: testCode } } = {}) {
  return new Request('https://project.supabase.co/functions/v1/invite-staff', { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

test('invalid staff codes cannot create invitations regardless of bearer identity', async () => {
  for (const options of [{ user: null }, { user: { id: 'unverified' }, role: 'admin' }, { user: verified, role: 'member' }, { user: verified, role: 'staff' }]) {
    const { handler, counts } = await handlerFor(options)
    assert.equal((await handler(request({body:{email:'staff@example.test',display_name:'Staff',authorization_code:'wrong-code'}}))).status,403)
    assert.deepEqual(counts(), { sends: 0, writes: 0 })
  }
  const { handler, counts } = await handlerFor({ user: verified, role: 'admin' })
  assert.equal((await handler(request({ token: '', body:{email:'staff@example.test',display_name:'Staff'} }))).status, 403)
  assert.deepEqual(counts(), { sends: 0, writes: 0 })
})

test('the correct server-checked code allows invitations without owner sign-in', async () => {
  const { handler, counts } = await handlerFor()
  assert.equal((await handler(request({ origin: 'https://untrusted.example' }))).status, 403)
  assert.equal((await handler(request({ body: { email: 'bad-address', display_name: 'Staff', authorization_code:testCode } }))).status, 400)
  assert.deepEqual(counts(), { sends: 0, writes: 0 })
  const response = await handler(request({token:''}))
  assert.equal(response.status, 200)
  assert.match((await response.json()).message, /email verification/)
  assert.deepEqual(counts(), { sends: 1, writes: 1 })
})

test('email-provider failure is reported as failure and repeated invites are throttled', async () => {
  const failed = await handlerFor({ user: verified, role: 'admin', inviteResult: { error: { message: 'SMTP failure' } } })
  const response = await failed.handler(request())
  assert.equal(response.status, 502)
  assert.match((await response.json()).error, /could not be sent/)
  const throttled = await handlerFor({ user: verified, role: 'admin', oldInvite: { created_at: new Date().toISOString() } })
  assert.equal((await throttled.handler(request())).status, 429)
  assert.deepEqual(throttled.counts(), { sends: 0, writes: 0 })
})

test('a valid staff code is required before any database write or email', async () => {
  const { handler, counts } = await handlerFor({ user: verified, role: 'admin' })
  for (const authorization_code of [undefined, '', 'wrong-code', 'x'.repeat(129)]) {
    const response = await handler(request({body: {email:'staff@example.test', display_name:'Staff', authorization_code}}))
    assert.equal(response.status, 403)
    assert.deepEqual(counts(), {sends:0, writes:0})
  }
  const unconfigured = await handlerFor({user:verified, role:'admin', codeHash:''})
  assert.equal((await unconfigured.handler(request())).status,503)
  assert.deepEqual(unconfigured.counts(), {sends:0,writes:0})
})

test('code validation sends no email and never bypasses the invitation code check', async () => {
  const {handler,counts} = await handlerFor()
  const result = await handler(request({token:'',body:{action:'validate-code',authorization_code:testCode}}))
  assert.equal(result.status,200)
  assert.equal((await result.json()).valid,true)
  assert.deepEqual(counts(),{sends:0,writes:0})
  assert.equal((await handler(request({token:'',body:{email:'staff@example.test',display_name:'Staff',authorization_code:'wrong-code'}}))).status,403)
  assert.deepEqual(counts(),{sends:0,writes:0})
})
