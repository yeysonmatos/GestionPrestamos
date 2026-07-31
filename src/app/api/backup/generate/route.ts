import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { exportBackup } from '@/lib/backup/export'
import { rateLimitByIp } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    if (!rateLimitByIp(request, 'backup:generate', 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 })
    }

    const { supabase } = await createRouteHandlerClient(request)

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: authErr?.message || 'No autorizado' }, { status: 401 })
    }

    const result = await exportBackup(supabase, user.id)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      userId: user.id,
      count: result.count,
      tables: result.tables,
      path: result.path,
    })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
