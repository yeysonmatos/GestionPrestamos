import { NextRequest, NextResponse } from 'next/server'
import { createApiRouteClient } from '@/lib/supabase-route'
import { createAdminClient } from '@/lib/supabase-admin'
import { notifyPayRequest } from '@/lib/notify/actions'
import { rateLimitByIp, addRateLimitHeaders } from '@/lib/rate-limit'

// Solicitud de pago de suscripción (cliente).
// Crea un registro 'pending' y notifica al admin. Fire-and-forget el email.
export async function POST(request: NextRequest) {
  const rl = rateLimitByIp(request, 'subscription:pay', 5, 10 * 60 * 1000)
  if (!rl.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 }),
      rl
    )
  }

  const { supabase } = createApiRouteClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return addRateLimitHeaders(NextResponse.json({ error: 'No autenticado' }, { status: 401 }), rl)
  }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return addRateLimitHeaders(NextResponse.json({ error: 'Configuración incompleta' }, { status: 500 }), rl)
  }

  const body = await request.json().catch(() => ({}))
  const { method = 'transfer', notes = null } = body

  try {
    const { data: subscription, error: subErr } = await adminClient
      .from('subscriptions')
      .select('id, plan_id, plan:plans(price, name, billing_cycle)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })
    if (!subscription) {
      return addRateLimitHeaders(NextResponse.json({ error: 'No tienes una suscripción activa' }, { status: 400 }), rl)
    }

    const plan = Array.isArray(subscription.plan) ? subscription.plan[0] : subscription.plan
    const price = Number(plan?.price || 0)
    if (price <= 0) {
      return addRateLimitHeaders(NextResponse.json({ error: 'Tu plan actual es gratuito' }, { status: 400 }), rl)
    }

    const { data: existing } = await adminClient
      .from('subscription_payments')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (existing) {
      return addRateLimitHeaders(NextResponse.json({ error: 'Ya tienes una solicitud de pago pendiente. Espera a que el administrador la confirme.' }, { status: 400 }), rl)
    }

    const { data: payment, error: payErr } = await adminClient
      .from('subscription_payments')
      .insert({
        subscription_id: subscription.id,
        user_id: user.id,
        amount: price,
        payment_date: new Date().toISOString().slice(0, 10),
        method,
        notes: notes || null,
        status: 'pending',
      })
      .select()
      .single()

    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

    // Notificar al admin (cola email_messages, fire-and-forget)
    try {
      const { data: appUser } = await adminClient.from('app_users').select('display_name').eq('id', user.id).maybeSingle()
      await notifyPayRequest(adminClient, supabase, {
        prestamistaName: appUser?.display_name || user.email || undefined,
        email: user.email,
        plan: plan?.name || undefined,
        amount: `RD$${price.toLocaleString('en-US')}`,
        paymentId: payment.id,
        actorUserId: user.id,
      })
    } catch (err) {
      console.error('[subscription/pay] Notificación al admin falló:', err)
    }

    return addRateLimitHeaders(NextResponse.json({ ok: true, payment_id: payment.id }), rl)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ message: 'POST /api/subscription/pay — Crea una solicitud de pago de suscripción' })
}
