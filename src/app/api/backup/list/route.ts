import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { listBackups } from '@/lib/backup/import'

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await createRouteHandlerClient(request)

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: authErr?.message || 'No autorizado' }, { status: 401 })
    }

    const backups = await listBackups(supabase, user.id)
    return NextResponse.json({ ok: true, userId: user.id, backups })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
