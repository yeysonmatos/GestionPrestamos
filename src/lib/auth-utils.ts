const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/(.+)\.supabase\.co/)?.[1] || ''

export function getAuthCookieName() {
  return `sb-${PROJECT_REF}-auth-token`
}

export function setAuthCookie(session: { access_token: string; refresh_token: string; expires_at?: number }) {
  const cookieName = getAuthCookieName()
  const value = btoa(JSON.stringify(session))
  const maxAge = session.expires_at
    ? Math.max(0, session.expires_at - Math.floor(Date.now() / 1000))
    : 3600
  document.cookie = `${cookieName}=${value}; path=/; secure; samesite=lax; max-age=${maxAge}`
}

export function clearAuthCookie() {
  document.cookie = `${getAuthCookieName()}=; path=/; secure; samesite=lax; max-age=0`
}
