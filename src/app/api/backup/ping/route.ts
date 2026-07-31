import { NextRequest, NextResponse } from 'next/server'
import { rateLimitByIp } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  if (!rateLimitByIp(request, 'backup:ping', 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 })
  }
  return NextResponse.json({ ok: true, time: Date.now() })
}

export async function POST(request: NextRequest) {
  if (!rateLimitByIp(request, 'backup:ping', 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 })
  }
  return NextResponse.json({ ok: true, time: Date.now() })
}
