import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueAndSend } from './queue'
import { renderTemplate, type TemplateKey } from './templates'

// Resuelve el email del primer admin (dueño del sistema).
// Devuelve null si no hay admin con email disponible.
export async function getAdminEmail(admin: SupabaseClient): Promise<{ email: string; name?: string | null } | null> {
  const { data: admins } = await admin.from('app_users').select('id').eq('role', 'admin').limit(1)
  const adminId = admins?.[0]?.id
  if (!adminId) return null
  const { data: authUser } = await admin.auth.admin.getUserById(adminId)
  const email = authUser?.user?.email
  if (!email) return null
  return { email, name: (authUser?.user?.user_metadata?.full_name as string | undefined) }
}

// Resuelve email + display_name de un usuario prestamista desde su id.
export async function getPrestamistaContact(admin: SupabaseClient, userId: string): Promise<{ email: string; name?: string | null } | null> {
  const [{ data: authUser }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from('app_users').select('display_name').eq('id', userId).maybeSingle(),
  ])
  const email = authUser?.user?.email
  if (!email) return null
  return { email, name: (profile?.display_name as string | undefined) || null }
}

interface BaseNotifyOptions {
  recipientType?: 'admin' | 'prestamista'
  actorUserId?: string | null
  entityType?: string | null
  entityId?: string | null
  dedupeKey?: string | null
}

// Núcleo: arma el mensaje, lo registra (envía en segundo plano) y audita.
async function dispatch(
  admin: SupabaseClient,
  supabase: SupabaseClient | null,
  opts: BaseNotifyOptions,
  templateKey: TemplateKey,
  data: Record<string, unknown>,
  recipient: { email: string; name?: string | null } | null,
  eventType: string
): Promise<string | null> {
  if (!recipient) return null

  const { subject, html } = renderTemplate({ key: templateKey, data })

  const id = await enqueueAndSend(admin, {
    recipientType: opts.recipientType || 'prestamista',
    recipientEmail: recipient.email,
    recipientName: recipient.name ?? null,
    templateKey,
    subject,
    htmlBody: html,
    eventType,
    entityType: opts.entityType ?? null,
    entityId: opts.entityId ?? null,
    dedupeKey: opts.dedupeKey ?? null,
  })

  if (id && supabase && opts.actorUserId) {
    // Auditoría de la notificación (registro en la app del actor)
    try {
      await supabase.from('audit_logs').insert({
        user_id: opts.actorUserId,
        action: `notification.${eventType}`,
        entity_type: 'email_message',
        entity_id: id,
        details: { to: recipient.email },
      })
    } catch (err) {
      console.error('[notify] audit error:', err)
    }
  }

  return id
}

// ---------- Prestamista → Admin ----------

export async function notifyNewTicket(admin: SupabaseClient, supabase: SupabaseClient | null, opts: { subject: string; priority?: string; prestamistaName?: string; email?: string; ticketId: string; actorUserId: string }) {
  const recipient = await getAdminEmail(admin)
  return dispatch(admin, supabase, { recipientType: 'admin', actorUserId: opts.actorUserId, entityType: 'support_ticket', entityId: opts.ticketId }, 'new_ticket', opts, recipient, 'ticket.created')
}

export async function notifyPayRequest(admin: SupabaseClient, supabase: SupabaseClient | null, opts: { prestamistaName?: string; email?: string; plan?: string; amount?: string; paymentId: string; actorUserId: string }) {
  const recipient = await getAdminEmail(admin)
  return dispatch(admin, supabase, { recipientType: 'admin', actorUserId: opts.actorUserId, entityType: 'subscription_payment', entityId: opts.paymentId }, 'pay_request', opts, recipient, 'pay.request')
}

export async function notifyUpgradeRequest(admin: SupabaseClient, supabase: SupabaseClient | null, opts: { prestamistaName?: string; email?: string; targetPlan?: string; amount?: string; userId: string; actorUserId: string }) {
  const recipient = await getAdminEmail(admin)
  return dispatch(admin, supabase, { recipientType: 'admin', actorUserId: opts.actorUserId, entityType: 'subscription', entityId: opts.userId }, 'upgrade_request', opts, recipient, 'upgrade.request')
}

// ---------- Admin → Prestamista ----------

export async function notifyTicketReplied(admin: SupabaseClient, supabase: SupabaseClient | null, opts: { subject: string; email: string; ticketId: string; actorUserId?: string }) {
  const recipient = { email: opts.email, name: null }
  return dispatch(admin, supabase, { recipientType: 'prestamista', actorUserId: opts.actorUserId ?? null, entityType: 'support_ticket', entityId: opts.ticketId }, 'ticket_replied', opts, recipient, 'ticket.replied')
}

export async function notifyStaffReplyByUserId(admin: SupabaseClient, supabase: SupabaseClient | null, opts: { subject: string; userId: string; ticketId: string; actorUserId?: string }) {
  const recipient = await getPrestamistaContact(admin, opts.userId)
  return dispatch(admin, supabase, { recipientType: 'prestamista', actorUserId: opts.actorUserId ?? null, entityType: 'support_ticket', entityId: opts.ticketId }, 'ticket_replied', opts, recipient, 'ticket.replied')
}

export async function notifyTicketClosed(admin: SupabaseClient, supabase: SupabaseClient | null, opts: { subject: string; userId: string; ticketId: string; actorUserId?: string }) {
  const recipient = await getPrestamistaContact(admin, opts.userId)
  return dispatch(admin, supabase, { recipientType: 'prestamista', actorUserId: opts.actorUserId ?? null, entityType: 'support_ticket', entityId: opts.ticketId }, 'ticket_closed', opts, recipient, 'ticket.closed')
}

export async function notifyPaymentApproved(admin: SupabaseClient, supabase: SupabaseClient | null, opts: { userId: string; plan?: string; amount?: string; endsAt?: string; actorUserId?: string }) {
  const recipient = await getPrestamistaContact(admin, opts.userId)
  return dispatch(admin, supabase, { recipientType: 'prestamista', actorUserId: opts.actorUserId ?? null, entityType: 'subscription_payment', entityId: opts.userId }, 'payment_approved', opts, recipient, 'payment.approved')
}

export async function notifyPlanUpdated(admin: SupabaseClient, supabase: SupabaseClient | null, opts: { userId: string; plan?: string; endsAt?: string; actorUserId?: string }) {
  const recipient = await getPrestamistaContact(admin, opts.userId)
  return dispatch(admin, supabase, { recipientType: 'prestamista', actorUserId: opts.actorUserId ?? null, entityType: 'subscription', entityId: opts.userId }, 'plan_updated', opts, recipient, 'plan.updated')
}

export async function notifyPlanExpiring(admin: SupabaseClient, supabase: SupabaseClient | null, opts: { userId: string; plan?: string; endsAt?: string; days?: number; expired?: boolean; actorUserId?: string }) {
  const recipient = await getPrestamistaContact(admin, opts.userId)
  return dispatch(admin, supabase, { recipientType: 'prestamista', actorUserId: opts.actorUserId ?? null, entityType: 'subscription', entityId: opts.userId }, 'plan_expiring', opts, recipient, 'plan.expiring')
}

export async function notifyTrialExpired(admin: SupabaseClient, opts: { userId: string; prestamistaName?: string; email?: string; dedupeKey?: string }) {
  // Destino: el admin (dueño del sistema). Dedupe por usuario+día para no spamear.
  const recipient = await getAdminEmail(admin)
  const contact = await getPrestamistaContact(admin, opts.userId)
  const data: Record<string, unknown> = {
    userId: opts.userId,
    prestamistaName: opts.prestamistaName || contact?.name || contact?.email || opts.email || 'un prestamista',
    email: contact?.email || opts.email || '',
  }
  return dispatch(admin, null, {
    recipientType: 'admin',
    actorUserId: null,
    entityType: 'subscription',
    entityId: opts.userId,
    dedupeKey: opts.dedupeKey ?? null,
  }, 'trial_expired', data, recipient, 'trial.expired')
}