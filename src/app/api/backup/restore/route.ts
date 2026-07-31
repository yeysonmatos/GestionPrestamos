import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { restoreBackup } from '@/lib/backup/import'
import { rateLimitByIp } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    if (!rateLimitByIp(request, 'backup:restore', 3, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 })
    }

    const { supabase } = await createRouteHandlerClient(request)

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: authErr?.message || 'No autorizado' }, { status: 401 })
    }

    let body: any
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    if (!body.folder) return NextResponse.json({ error: 'Se requiere folder' }, { status: 400 })

    const result = await restoreBackup(supabase, user.id, body.folder)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })

    logAuditEvent(supabase, { userId: user.id, action: 'backup.restored', entityType: 'backup', details: { folder: body.folder, tables: result.tables, count: result.count } })

    return NextResponse.json({ ok: true, tables: result.tables, count: result.count })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
