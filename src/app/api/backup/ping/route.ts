import { NextRequest, NextResponse } from 'next/server'
import { rateLimitByIp, addRateLimitHeaders } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const rl = rateLimitByIp(request, 'backup:ping', 60, 60 * 1000)
  if (!rl.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 }),
      rl
    )
  }
  return addRateLimitHeaders(NextResponse.json({ ok: true, time: Date.now() }), rl)
}

export async function POST(request: NextRequest) {
  const rl = rateLimitByIp(request, 'backup:ping', 60, 60 * 1000)
  if (!rl.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 }),
      rl
    )
  }
  return addRateLimitHeaders(NextResponse.json({ ok: true, time: Date.now() }), rl)
}
