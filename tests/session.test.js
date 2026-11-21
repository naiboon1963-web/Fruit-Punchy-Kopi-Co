import test from 'node:test'
import assert from 'node:assert/strict'
import { watchVerifiedSession } from '../src/auth/session.js'

function setup() {
  let event
  const pending = []
  const states = []
  const client = { auth: {
    getUser: () => new Promise(resolve => pending.push(resolve)),
    onAuthStateChange: callback => { event = callback; return { data: { subscription: { unsubscribe() {} } } } },
  } }
  const watcher = watchVerifiedSession(client, state => states.push(state), () => {})
  return { pending, states, watcher, emit: (...args) => event(...args) }
}

test('signout invalidates a pending server verification', async () => {
  const s = setup()
  s.emit('SIGNED_OUT', null)
  s.pending[0]({ data: { user: { id: 'old' } }, error: null })
  await Promise.resolve()
  assert.equal(s.states.at(-1).user, null)
  assert.equal(s.states.at(-1).loading, false)
  s.watcher.dispose()
})

test('cached auth user is withheld until the server verifies it', async () => {
  const s = setup()
  s.emit('SIGNED_IN', { user: { id: 'forged' } })
  assert.equal(s.states.at(-1).user, null)
  assert.equal(s.states.at(-1).loading, true)
  await new Promise(resolve => setTimeout(resolve, 10))
  s.pending.at(-1)({ data: { user: null }, error: new Error('Invalid token') })
  await Promise.resolve()
  assert.equal(s.states.at(-1).user, null)
  assert.match(s.states.at(-1).authError, /verified/)
  s.watcher.dispose()
})

test('verified users are released and disposed requests cannot update state', async () => {
  const s = setup()
  s.pending[0]({ data: { user: { id: 'verified' } }, error: null })
  await Promise.resolve()
  assert.equal(s.states.at(-1).user.id, 'verified')
  const refresh = s.watcher.refresh()
  s.watcher.dispose()
  const count = s.states.length
  s.pending.at(-1)({ data: { user: { id: 'late' } }, error: null })
  await refresh
  assert.equal(s.states.length, count)
})
