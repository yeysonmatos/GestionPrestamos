import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { restoreBackup } from '@/lib/backup/import'
import { rateLimitByIp, addRateLimitHeaders } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimitByIp(request, 'backup:restore', 3, 10 * 60 * 1000)
    if (!rl.allowed) {
      return addRateLimitHeaders(
        NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 }),
        rl
      )
    }

    const { supabase } = await createRouteHandlerClient(request)

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return addRateLimitHeaders(
        NextResponse.json({ error: authErr?.message || 'No autorizado' }, { status: 401 }),
        rl
      )
    }

    let body: any
    try { body = await request.json() } catch {
      return addRateLimitHeaders(
        NextResponse.json({ error: 'JSON inválido' }, { status: 400 }),
        rl
      )
    }
    if (!body.folder) {
      return addRateLimitHeaders(
        NextResponse.json({ error: 'Se requiere folder' }, { status: 400 }),
        rl
      )
    }

    const result = await restoreBackup(supabase, user.id, body.folder)
    if ('error' in result) {
      return addRateLimitHeaders(NextResponse.json({ error: result.error }, { status: 500 }), rl)
    }

    logAuditEvent(supabase, { userId: user.id, action: 'backup.restored', entityType: 'backup', details: { folder: body.folder, tables: result.tables, count: result.count } })

    return addRateLimitHeaders(NextResponse.json({ ok: true, tables: result.tables, count: result.count }), rl)
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
