import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user') || ''
  const action = searchParams.get('action') || ''
  const entity = searchParams.get('entity') || ''
  const q = searchParams.get('q') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200)

  try {
    let query = adminClient
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (userId) query = query.eq('user_id', userId)
    if (action) query = query.eq('action', action)
    if (entity) query = query.eq('entity_type', entity)
    if (from) query = query.gte('created_at', new Date(from).toISOString())
    if (to) query = query.lte('created_at', new Date(to + 'T23:59:59.999').toISOString())

    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

    const logs = (data || []) as {
      id: string
      user_id: string
      action: string
      entity_type: string
      entity_id: string | null
      details: Record<string, unknown>
      created_at: string
    }[]

    const userIds = [...new Set(logs.map(l => l.user_id))]
    const { data: profiles } = userIds.length
      ? await adminClient.from('app_users').select('id, display_name, role').in('id', userIds)
      : { data: [] }
    const nameMap = new Map((profiles || []).map(p => [p.id, p.display_name || null]))
    const roleMap = new Map((profiles || []).map(p => [p.id, p.role || 'client']))

    const entries = logs.map(l => ({
      id: l.id,
      user_id: l.user_id,
      user_name: nameMap.get(l.user_id) || '—',
      role: roleMap.get(l.user_id) || 'client',
      action: l.action,
      entity_type: l.entity_type,
      entity_id: l.entity_id,
      details: l.details,
      created_at: l.created_at,
    }))

    const filtered = q
      ? entries.filter(e =>
          (e.user_name || '').toLowerCase().includes(q.toLowerCase()) ||
          e.action.toLowerCase().includes(q.toLowerCase()) ||
          e.entity_type.toLowerCase().includes(q.toLowerCase())
        )
      : entries

    return NextResponse.json({ logs: filtered, total: count ?? filtered.length }, supabaseResponse)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}
