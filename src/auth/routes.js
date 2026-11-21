// Protected paths take precedence over account query parameters and callbacks.
export function resolveRoute({ pathname, search, hash }) {
  if (/^\/members(?:\/|$)/.test(pathname)) return 'members'
  if (new URLSearchParams(search).has('account') ||
      new URLSearchParams(hash.slice(1)).has('access_token')) return 'account'
  return 'public'
}

// Restrict return destinations to member paths on this origin.
export function memberDestination(value) {
  if (value === 'members') return '/members'
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\s]/.test(value)) return '/members'
  const base = 'https://cafe.invalid'
  try {
    const url = new URL(value, base)
    if (url.origin !== base || !/^\/members(?:\/|$)/.test(url.pathname)) return '/members'
    // Account parameters must not turn the destination into another auth flow.
    url.searchParams.delete('account')
    url.searchParams.delete('next')
    return url.pathname + url.search + url.hash
  } catch { return '/members' }
}

export function accountDestination(location) {
  // Protected pages already reached their destination; never redirect them again.
  if (resolveRoute(location) !== 'account') return null
  const next = new URLSearchParams(location.search).get('next')
  return next ? memberDestination(next) : null
}

export function memberSignInUrl(location) {
  const next = memberDestination(location.pathname + location.search + location.hash)
  return '/?account=signin&' + new URLSearchParams({ next }).toString()
}
