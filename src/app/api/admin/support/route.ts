import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { notifyTicketClosed } from '@/lib/notify/actions'

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || ''
  const priority = searchParams.get('priority') || ''
  const q = searchParams.get('q') || ''
  const userId = searchParams.get('user_id') || ''
  const type = searchParams.get('type') || ''

  let query = adminClient
    .from('support_tickets')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (status && ['open', 'replied', 'closed'].includes(status)) query = query.eq('status', status)
  if (priority && ['low', 'normal', 'high'].includes(priority)) query = query.eq('priority', priority)
  if (userId) query = query.eq('user_id', userId)
  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

  // Resolver display_name desde app_users (user_id apunta a auth.users, no embebible)
  const userIds = [...new Set((data || []).map(t => t.user_id))]
  const { data: profiles } = userIds.length
    ? await adminClient.from('app_users').select('id, display_name').in('id', userIds)
    : { data: [] }
  const nameMap = new Map((profiles || []).map(p => [p.id, p.display_name || null]))

  const tickets = (data || []).map(t => ({
    id: t.id,
    subject: t.subject,
    body: t.body,
    status: t.status,
    priority: t.priority,
    created_at: t.created_at,
    updated_at: t.updated_at,
    closed_at: t.closed_at,
    user_id: t.user_id,
    author_name: nameMap.get(t.user_id) || null,
  }))

  const filtered = q
    ? tickets.filter(t =>
        (t.subject || '').toLowerCase().includes(q.toLowerCase()) ||
        (t.author_name || '').toLowerCase().includes(q.toLowerCase())
      )
    : tickets

  return NextResponse.json({ tickets: filtered }, supabaseResponse)
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const body = await request.json().catch(() => ({}))

  if (!body.id) return NextResponse.json({ error: 'Falta id' }, { status: 400, headers: supabaseResponse.headers })

  const patch: Record<string, unknown> = {}
  if (body.status) patch.status = body.status
  if (body.priority) patch.priority = body.priority
  if (body.status === 'closed') patch.closed_at = new Date().toISOString()
  if (body.status === 'open') patch.closed_at = null

  const { error } = await adminClient.from('support_tickets').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

  if (body.status === 'closed') {
    const { data: ticket } = await adminClient.from('support_tickets').select('user_id, subject').eq('id', body.id).maybeSingle()
    if (ticket) {
      await notifyTicketClosed(adminClient, null, {
        subject: ticket.subject,
        userId: ticket.user_id,
        ticketId: body.id,
        actorUserId: guard.userId,
      }).catch(err => console.error('[admin support] notify closed:', err))
    }
  }

  return NextResponse.json({ ok: true }, supabaseResponse)
}