import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createAdminClient } from '@/lib/supabase-admin'
import { notifyNewTicket, notifyTicketReplied } from '@/lib/notify/actions'

// Notificaciones de soporte. Fire-and-forget: el cliente las llama tras crear
// el ticket. Los envíos usan la cola de email_messages (SMTP, historial, retries).
export async function POST(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401, headers: supabaseResponse.headers })
  }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: 'Configuración incompleta' }, { status: 500, headers: supabaseResponse.headers })
  }

  const body = await request.json().catch(() => ({}))
  const { event, ticketId } = body

  try {
    if (event === 'new_ticket') {
      const { data: ticket } = await adminClient
        .from('support_tickets')
        .select('subject, priority, user_id')
        .eq('id', ticketId)
        .eq('user_id', user.id)
        .single()
      if (!ticket) {
        return NextResponse.json({ ok: true, skipped: true }, { headers: supabaseResponse.headers })
      }
      const { data: profile } = await adminClient.from('app_users').select('display_name').eq('id', ticket.user_id).maybeSingle()
      await notifyNewTicket(adminClient, supabase, {
        subject: ticket.subject,
        priority: ticket.priority,
        prestamistaName: profile?.display_name || user.email || undefined,
        email: user.email ?? undefined,
        ticketId,
        actorUserId: user.id,
      })
    } else if (event === 'staff_reply') {
      const { data: ticket } = await adminClient
        .from('support_tickets')
        .select('user_id, subject')
        .eq('id', ticketId)
        .eq('user_id', user.id)
        .single()
      if (!ticket) {
        return NextResponse.json({ ok: true, skipped: true }, { headers: supabaseResponse.headers })
      }
      await notifyTicketReplied(adminClient, supabase, {
        subject: ticket.subject,
        email: user.email ?? '',
        ticketId,
        actorUserId: ticket.user_id,
      })
    }
  } catch (err) {
    console.error('[notify] Error:', err)
  }

  return NextResponse.json({ ok: true }, { headers: supabaseResponse.headers })
}