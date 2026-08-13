import type { SupabaseClient } from '@supabase/supabase-js'

// Error de negocio (validación / estado inconsistente) que debe mapearse a HTTP 400.
export class BillingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillingError'
  }
}

export interface RecordSubscriptionPaymentParams {
  adminClient: SupabaseClient
  user_id: string
  subscription_id?: string
  amount: number
  target_plan_id?: string | null
  payment_date?: string
  method?: string
  notes?: string | null
  // Si se pasa payment_id, se confirma una solicitud pendiente existente
  // en lugar de crear un pago nuevo (flujo de upgrade/renovación solicitada).
  payment_id?: string
}

export interface RecordSubscriptionPaymentResult {
  ok: boolean
  payment_id: string
  subscription: { id: string; plan_id: string; ends_at: string }
  is_upgrade: boolean
}

// Núcleo único para registrar un pago de suscripción y aplicar sus efectos:
// activa/extiende la suscripción (respetando target_plan_id para upgrades) y
// escribe el audit_log. Usado por el pago directo del admin (POST /api/admin/payments)
// y por la confirmación de solicitudes pendientes (PATCH /api/admin/users/[id]).
export async function recordSubscriptionPayment(
  params: RecordSubscriptionPaymentParams
): Promise<RecordSubscriptionPaymentResult> {
  const { adminClient, user_id } = params

  // --- Resolver el pago a confirmar (existente pendiente o uno nuevo) ---
  let payment: { id: string; subscription_id: string; amount: number; target_plan_id: string | null }
  if (params.payment_id) {
    const { data, error } = await adminClient
      .from('subscription_payments')
      .select('id, subscription_id, amount, target_plan_id')
      .eq('id', params.payment_id)
      .eq('user_id', user_id)
      .eq('status', 'pending')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new BillingError('Solicitud de pago no encontrada o ya procesada')
    payment = { ...data, amount: Number(data.amount) }
  } else {
    if (params.amount <= 0) throw new BillingError('El monto debe ser mayor que cero')

    let subId = params.subscription_id
    if (!subId) {
      const { data: sub } = await adminClient
        .from('subscriptions')
        .select('id')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      subId = sub?.id
    }
    if (!subId) throw new BillingError('El usuario no tiene una suscripción')

    const { data, error } = await adminClient
      .from('subscription_payments')
      .insert({
        subscription_id: subId,
        user_id,
        amount: params.amount,
        payment_date: params.payment_date || new Date().toISOString().slice(0, 10),
        method: params.method || 'cash',
        notes: params.notes || null,
        status: 'confirmed',
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    payment = { id: data.id, subscription_id: data.subscription_id, amount: Number(data.amount), target_plan_id: params.target_plan_id || null }
  }

  // --- Cargar suscripción y plan resuelto ---
  const { data: sub, error: subErr } = await adminClient
    .from('subscriptions')
    .select('id, plan_id, status, ends_at')
    .eq('id', payment.subscription_id)
    .maybeSingle()
  if (subErr) throw new Error(subErr.message)
  if (!sub) throw new BillingError('La suscripción ya no existe')

  const resolvedPlanId = payment.target_plan_id || sub.plan_id
  const isUpgrade = !!payment.target_plan_id

  const { data: plan } = await adminClient
    .from('plans')
    .select('billing_cycle, name')
    .eq('id', resolvedPlanId)
    .maybeSingle()
  const days = plan?.billing_cycle === 'yearly' ? 365 : 30

  // En un upgrade prorrateado se conserva el vencimiento actual (se cobra la
  // diferencia); en una renovación/pago directo se extiende el ciclo completo.
  let newEnd: string
  if (isUpgrade && sub.ends_at && new Date(sub.ends_at).getTime() > Date.now()) {
    newEnd = sub.ends_at
  } else {
    const base = sub.ends_at && new Date(sub.ends_at).getTime() > Date.now()
      ? new Date(sub.ends_at)
      : new Date()
    newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
  }

  // --- Aplicar efectos ---
  const { error: subUpdErr } = await adminClient
    .from('subscriptions')
    .update({ status: 'active', plan_id: resolvedPlanId, ends_at: newEnd })
    .eq('id', sub.id)
  if (subUpdErr) throw new Error(subUpdErr.message)

  if (params.payment_id) {
    const { error: confirmErr } = await adminClient
      .from('subscription_payments')
      .update({ status: 'confirmed' })
      .eq('id', payment.id)
    if (confirmErr) throw new Error(confirmErr.message)
  }

  const { error: auditErr } = await adminClient.from('audit_logs').insert({
    user_id,
    action: isUpgrade ? 'subscription.upgraded' : 'subscription.paid',
    entity_type: 'subscription_payment',
    entity_id: payment.id,
    details: { amount: payment.amount, days, plan: plan?.name || plan?.billing_cycle || 'monthly' },
  })
  if (auditErr) throw new Error(auditErr.message)

  return { ok: true, payment_id: payment.id, subscription: { id: sub.id, plan_id: resolvedPlanId, ends_at: newEnd }, is_upgrade: isUpgrade }
}
