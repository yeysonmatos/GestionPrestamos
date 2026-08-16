interface Window {
  count: number
  resetAt: number
}

interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterMs?: number
}

const buckets = new Map<string, Window>()
const CLEANUP_THRESHOLD = 1000
const CLEANUP_INTERVAL_MS = 60_000

let cleanupInterval: NodeJS.Timeout | null = null

function scheduleCleanup() {
  if (cleanupInterval) return
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, w] of buckets) {
      if (w.resetAt <= now) buckets.delete(key)
    }
  }, CLEANUP_INTERVAL_MS)
  if (cleanupInterval.unref) cleanupInterval.unref()
}

function pruneExpired(now: number) {
  if (buckets.size < CLEANUP_THRESHOLD) return
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key)
  }
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const cf = request.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

export function getRateLimitKey(request: Request, scope: string): string {
  // Solo IP real del proxy inverso (Vercel/Cloudflare). NO se confía en
  // headers controlables por el cliente (x-user-id) porque es bypasseable.
  return `${scope}:ip:${getClientIp(request)}`
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  scheduleCleanup()
  pruneExpired(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, limit, remaining: limit - 1, resetAt: now + windowMs }
  }

  existing.count += 1
  const allowed = existing.count <= limit
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterMs: allowed ? undefined : existing.resetAt - now,
  }
}

export function rateLimitByIp(request: Request, scope: string, limit: number, windowMs: number): RateLimitResult {
  return rateLimit(getRateLimitKey(request, scope), limit, windowMs)
}

export function addRateLimitHeaders(response: Response, result: RateLimitResult): Response {
  const headers = new Headers(response.headers)
  headers.set('X-RateLimit-Limit', String(result.limit))
  headers.set('X-RateLimit-Remaining', String(result.remaining))
  headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)))
  if (result.retryAfterMs) {
    headers.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)))
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
