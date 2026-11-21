import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRoute, memberDestination, memberSignInUrl } from '../src/auth/routes.js'

const route = path => resolveRoute(new URL(path, 'https://cafe.example'))

test('member login preserves deep links and rejects external or public redirects', () => {
  const location = new URL('https://cafe.example/members/settings?tab=profile#name')
  const login = new URL(memberSignInUrl(location), location.origin)
  assert.equal(memberDestination(login.searchParams.get('next')), '/members/settings?tab=profile#name')
  assert.equal(memberDestination('members'), '/members')
  assert.equal(memberDestination('/members?account=reset&tab=profile'), '/members?tab=profile')
  for (const value of ['https://evil.example/members', '//evil.example/members', '/membership', '/members/../../public', '/members\\evil', null]) {
    assert.equal(memberDestination(value), '/members')
  }
})

test('member paths always pass through the guard, including account queries and auth fragments', () => {
  for (const path of ['/members', '/members/', '/members/settings', '/members?account=join', '/members#access_token=cached']) {
    assert.equal(route(path), 'members', path)
  }
})

test('public pages and account callbacks remain reachable', () => {
  assert.equal(route('/'), 'public')
  assert.equal(route('/membership'), 'public')
  assert.equal(route('/?account=signin&next=members'), 'account')
  assert.equal(route('/?account=reset'), 'account')
  assert.equal(route('/#access_token=callback'), 'account')
})
