interface Window {
  count: number
  resetAt: number
}

const buckets = new Map<string, Window>()
const CLEANUP_THRESHOLD = 1000

function pruneExpired(now: number) {
  if (buckets.size < CLEANUP_THRESHOLD) return
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key)
  }
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return 'unknown'
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  pruneExpired(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  existing.count += 1
  return existing.count <= limit
}

export function rateLimitByIp(request: Request, scope: string, limit: number, windowMs: number): boolean {
  return rateLimit(`${scope}:${getClientIp(request)}`, limit, windowMs)
}
