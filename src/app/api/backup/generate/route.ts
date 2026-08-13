import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { exportBackup } from '@/lib/backup/export'
import { rateLimitByIp, addRateLimitHeaders } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimitByIp(request, 'backup:generate', 10, 60 * 60 * 1000)
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

    const result = await exportBackup(supabase, user.id)

    if ('error' in result) {
      return addRateLimitHeaders(NextResponse.json({ error: result.error }, { status: 500 }), rl)
    }

    logAuditEvent(supabase, { userId: user.id, action: 'backup.generated', entityType: 'backup', details: { folder: result.path, tables: result.tables, count: result.count } })

    return addRateLimitHeaders(
      NextResponse.json({
        ok: true,
        userId: user.id,
        count: result.count,
        tables: result.tables,
        path: result.path,
      }),
      rl
    )
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
