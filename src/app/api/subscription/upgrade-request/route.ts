import { NextRequest, NextResponse } from 'next/server'
import { createApiRouteClient } from '@/lib/supabase-route'
import { createAdminClient } from '@/lib/supabase-admin'
import { notifyUpgradeRequest } from '@/lib/notify/actions'
import { rateLimitByIp, addRateLimitHeaders } from '@/lib/rate-limit'
import { computeUpgradeAmount, formatPlanAmount } from '@/lib/prorate'

// Solicitud de upgrade de plan (cliente cambia de Trial/Básico a otro plan).
// Opción B: crea una solicitud de pago PENDIENTE por la diferencia prorrateada
// entre el plan actual y el nuevo, según el tiempo restante del ciclo.
// El admin confirma el pago y, en la misma acción, asigna el plan.
export async function POST(request: NextRequest) {
  const rl = rateLimitByIp(request, 'subscription:upgrade', 3, 60 * 60 * 1000)
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
  const { target_plan_id } = body

  try {
    // Validar usuario: debe tener una suscripción activa/trial
    const { data: subscription, error: subErr } = await adminClient
      .from('subscriptions')
      .select('id, status, plan_id, ends_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })
    if (!subscription || !['trial', 'active'].includes(subscription.status)) {
      return addRateLimitHeaders(NextResponse.json({ error: 'Solo puedes solicitar upgrade de un plan activo o Trial' }, { status: 400 }), rl)
    }

    // Plan actual (para calcular la diferencia prorrateada)
    let currentPrice = 0
    let currentCycle = 'monthly'
    const { data: currentPlan } = await adminClient
      .from('plans')
      .select('price, billing_cycle')
      .eq('id', subscription.plan_id)
      .maybeSingle()
    if (currentPlan) {
      currentPrice = Number(currentPlan.price || 0)
      currentCycle = currentPlan.billing_cycle || 'monthly'
    }

    // Validar plan objetivo (debe ser distinto al actual)
    const { data: targetPlan, error: planErr } = await adminClient
      .from('plans')
      .select('id, name, price, billing_cycle')
      .eq('id', target_plan_id)
      .eq('is_active', true)
      .maybeSingle()

    if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 })
    if (!targetPlan) {
      return addRateLimitHeaders(NextResponse.json({ error: 'Plan no encontrado o inactivo' }, { status: 400 }), rl)
    }
    if (Number(targetPlan.price) <= 0) {
      return addRateLimitHeaders(NextResponse.json({ error: 'El plan seleccionado no es de pago' }, { status: 400 }), rl)
    }
    if (targetPlan.id === subscription.plan_id) {
      return addRateLimitHeaders(NextResponse.json({ error: 'Ya estás en ese plan' }, { status: 400 }), rl)
    }

// Calcular monto a pagar por el upgrade (diferencia prorrateada si aplica)
    const prorated = computeUpgradeAmount({
      status: subscription.status,
      currentPrice: currentPrice,
      currentCycle: currentCycle,
      endsAt: subscription.ends_at,
      targetPrice: Number(targetPlan.price),
      targetCycle: targetPlan.billing_cycle,
    })
    const amount = prorated.amount
    const proratedNote = prorated.isUpgradeCredit
      ? `Upgrade a ${targetPlan.name} — RD$${formatPlanAmount(amount)} (diferencia)`
      : `Upgrade a ${targetPlan.name} — RD$${formatPlanAmount(amount)}`

    // Verificar si ya hay solicitud de pago pendiente (incluye upgrade)
    const { data: existing } = await adminClient
      .from('subscription_payments')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (existing) {
      return addRateLimitHeaders(NextResponse.json({ error: 'Ya tienes una solicitud de pago pendiente' }, { status: 400 }), rl)
    }

    // Crear solicitud de pago pendiente por la diferencia prorrateada
    const { data: payment, error: payErr } = await adminClient
      .from('subscription_payments')
      .insert({
        subscription_id: subscription.id,
        user_id: user.id,
        amount,
        payment_date: new Date().toISOString().slice(0, 10),
        method: 'transfer',
        notes: body.notes || proratedNote || `Upgrade a ${targetPlan.name}`,
        status: 'pending',
        target_plan_id: targetPlan.id,
      })
      .select()
      .single()

    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

    // Notificar al admin (cola email_messages, fire-and-forget)
    try {
      const { data: appUser } = await adminClient.from('app_users').select('display_name').eq('id', user.id).maybeSingle()
      await notifyUpgradeRequest(adminClient, supabase, {
        prestamistaName: appUser?.display_name || user.email || undefined,
        email: user.email,
        targetPlan: targetPlan.name,
        amount: `RD$${formatPlanAmount(Number(payment.amount))}`,
        userId: user.id,
        actorUserId: user.id,
      })
    } catch (err) {
      console.error('[upgrade-request] Notificación admin falló:', err)
    }

    return addRateLimitHeaders(NextResponse.json({ ok: true, payment_id: payment.id, amount: Number(payment.amount) }), rl)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

function formatNumber(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export async function GET() {
  return NextResponse.json({ message: 'POST /api/subscription/upgrade-request — Solicita upgrade de plan (pago por diferencia)' })
}