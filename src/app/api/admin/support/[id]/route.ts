import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { notifyStaffReplyByUserId } from '@/lib/notify/actions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { id } = await params

  const [tRes, mRes] = await Promise.all([
    adminClient.from('support_tickets').select('*').eq('id', id).maybeSingle(),
    adminClient.from('support_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true }),
  ])
  if (tRes.error) return NextResponse.json({ error: tRes.error.message }, { status: 500, headers: supabaseResponse.headers })
  if (mRes.error) return NextResponse.json({ error: mRes.error.message }, { status: 500, headers: supabaseResponse.headers })

  const t = tRes.data as any
  let authorName: string | null = null
  if (t?.user_id) {
    const { data: prof } = await adminClient.from('app_users').select('display_name').eq('id', t.user_id).maybeSingle()
    authorName = (prof as any)?.display_name || null
  }

  const ticket = t ? {
    id: t.id,
    subject: t.subject,
    body: t.body,
    status: t.status,
    priority: t.priority,
    attachments: t.attachments || [],
    created_at: t.created_at,
    user_id: t.user_id,
    author_name: authorName,
  } : null

  return NextResponse.json({ ticket, messages: (mRes.data || []) as any[] }, supabaseResponse)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  if (!body.body?.trim()) return NextResponse.json({ error: 'Mensaje es requerido' }, { status: 400, headers: supabaseResponse.headers })

  const { data: msg, error: insErr } = await adminClient
    .from('support_messages')
    .insert({ ticket_id: id, user_id: guard.userId, body: body.body.trim(), is_staff: true, attachments: body.attachments || [] })
    .select()
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500, headers: supabaseResponse.headers })

  // Marcar como respondido
  await adminClient.from('support_tickets').update({ status: 'replied' }).eq('id', id)

  // Notificar al prestamista (cola email_messages, fire-and-forget)
  try {
    const { data: tRes } = await adminClient.from('support_tickets').select('user_id, subject').eq('id', id).single()
    if (tRes) {
      await notifyStaffReplyByUserId(adminClient, null, {
        subject: tRes.subject,
        userId: tRes.user_id,
        ticketId: id,
        actorUserId: guard.userId,
      })
    }
  } catch (err) {
    console.error('[admin notify]', err)
  }

  return NextResponse.json({ message: msg }, supabaseResponse)
}