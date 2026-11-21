// Verify cached auth events with the Auth server before releasing protected UI.
export function watchVerifiedSession(client, publish, onRecovery) {
  let generation = 0
  let disposed = false
  let timer
  async function verify() {
    const current = ++generation
    publish({ user: null, loading: true, authError: '' })
    try {
      const { data, error } = await client.auth.getUser()
      if (disposed || current !== generation) return
      publish({ user: error ? null : data.user, loading: false,
        authError: error && error.name !== 'AuthSessionMissingError' ? 'Your session could not be verified. Please sign in again.' : '' })
    } catch {
      if (!disposed && current === generation) publish({ user: null, loading: false, authError: 'Unable to connect. Please try again.' })
    }
  }
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    ++generation
    clearTimeout(timer)
    if (event === 'PASSWORD_RECOVERY') onRecovery(true)
    if (event === 'SIGNED_OUT') onRecovery(false)
    publish({ user: null, loading: Boolean(session), authError: '' })
    // Leave the auth callback before calling the SDK again.
    if (session) timer = setTimeout(verify, 0)
  })
  void verify()
  return { refresh: verify, dispose() { disposed = true; ++generation; clearTimeout(timer); subscription.unsubscribe() } }
}
