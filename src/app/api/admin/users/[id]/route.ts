import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { recordSubscriptionPayment } from '@/lib/billing'
import { notifyPaymentApproved, notifyPlanUpdated } from '@/lib/notify/actions'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { id } = await params

  try {
    const [
      { data: authRows, error: authErr },
      { data: appUser, error: appErr },
      { data: subscriptions, error: subErr },
      { data: payments, error: payErr },
      { data: plans, error: planErr },
      { data: loans, error: loanErr },
      { data: clients, error: clientErr },
      { data: loanPayments, error: lpErr },
      { data: audit, error: auditErr },
    ] = await Promise.all([
      adminClient.rpc('admin_list_users'),
      adminClient.from('app_users').select('*').eq('id', id).maybeSingle(),
      adminClient.from('subscriptions').select('*').eq('user_id', id).order('created_at', { ascending: false }),
      adminClient.from('subscription_payments').select('*').eq('user_id', id).order('payment_date', { ascending: false }),
      adminClient.from('plans').select('*'),
      adminClient.from('loans').select('user_id, updated_at, amount').eq('user_id', id),
      adminClient.from('clients').select('user_id').eq('user_id', id),
      adminClient.from('payments').select('user_id, payment_date').eq('user_id', id),
      adminClient.from('audit_logs').select('id, action, entity_type, entity_id, details, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(50),
    ])

    if (authErr || appErr || subErr || payErr || planErr || loanErr || clientErr || lpErr || auditErr) {
      return NextResponse.json(
        { error: authErr?.message || appErr?.message || subErr?.message || payErr?.message || planErr?.message || loanErr?.message || clientErr?.message || lpErr?.message || auditErr?.message || 'Error al cargar usuario' },
        { status: 500, headers: supabaseResponse.headers }
      )
    }

    const auth = (authRows as { id: string; email: string; created_at: string; last_sign_in_at: string | null }[] | null)?.find(u => u.id === id) || null
    if (!auth && !appUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404, headers: supabaseResponse.headers })
    }

    const planMap = new Map((plans || []).map(p => [p.id, p]))
    const current = (subscriptions || [])[0] || null
    const subscription = current
      ? {
          id: current.id,
          plan_id: current.plan_id,
          plan_name: planMap.get(current.plan_id)?.name || '—',
          plan_price: Number(planMap.get(current.plan_id)?.price || 0),
          billing_cycle: planMap.get(current.plan_id)?.billing_cycle || 'monthly',
          status: current.status,
          starts_at: current.starts_at,
          ends_at: current.ends_at,
        }
      : null

    const history = (subscriptions || []).map(s => ({
      id: s.id,
      status: s.status,
      plan_name: planMap.get(s.plan_id)?.name || '—',
      plan_price: Number(planMap.get(s.plan_id)?.price || 0),
      billing_cycle: planMap.get(s.plan_id)?.billing_cycle || 'monthly',
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      created_at: s.created_at,
    }))

    const usage = {
      loans_count: (loans || []).length,
      clients_count: (clients || []).length,
      payments_count: (loanPayments || []).length,
      last_activity_at: (loanPayments || [])
        .map(p => p.payment_date)
        .sort()
        .reverse()[0] || (loans || []).map(l => l.updated_at).sort().reverse()[0] || null,
    }

    return NextResponse.json({
      user: {
        id: auth?.id || id,
        email: auth?.email || appUser?.email || '—',
        created_at: auth?.created_at || appUser?.created_at || null,
        last_sign_in_at: auth?.last_sign_in_at || null,
        role: appUser?.role || 'client',
        display_name: appUser?.display_name || auth?.email || '—',
        status: appUser?.status || 'active',
      },
      subscription,
      history,
      payments: (payments || []).map(p => ({ ...p, amount: Number(p.amount) })),
      usage,
      audit: (audit || []).map(a => ({ ...a, details: a.details || {} })),
    }, supabaseResponse)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  try {
    // Bloquear/desbloquear o cambiar rol
    if (typeof body.status !== 'undefined') {
      const { error } = await adminClient.from('app_users').update({ status: body.status }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })
    }

    // Restablecer contraseña del usuario (goTrue admin API)
    if (typeof body.reset_password !== 'undefined') {
      if (typeof body.reset_password !== 'string' || body.reset_password.length < 6) {
        return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }, { status: 400, headers: supabaseResponse.headers })
      }
      const { error: resetErr } = await adminClient.auth.admin.updateUserById(id, { password: body.reset_password })
      if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 500, headers: supabaseResponse.headers })
    }
    if (typeof body.role !== 'undefined') {
      const { error } = await adminClient.from('app_users').update({ role: body.role }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })
    }
    if (typeof body.display_name !== 'undefined') {
      const { error } = await adminClient.from('app_users').update({ display_name: body.display_name }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })
    }

    // Extender trial / días de cortesía sobre la suscripción actual
    if (body.subscription_action === 'extend' && body.days) {
      const days = Math.max(1, Number(body.days))
      const { data: currentSub } = await adminClient
        .from('subscriptions')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!currentSub) {
        return NextResponse.json({ error: 'El usuario no tiene una suscripción para extender' }, { status: 400, headers: supabaseResponse.headers })
      }

      const base = currentSub.ends_at && new Date(currentSub.ends_at).getTime() > Date.now()
        ? new Date(currentSub.ends_at)
        : new Date()
      const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)

      const { error: extErr } = await adminClient
        .from('subscriptions')
        .update({ status: currentSub.status === 'expired' || currentSub.status === 'cancelled' ? 'active' : currentSub.status, ends_at: newEnd.toISOString() })
        .eq('id', currentSub.id)
      if (extErr) return NextResponse.json({ error: extErr.message }, { status: 500, headers: supabaseResponse.headers })
    }

    // Confirmar una solicitud de pago pendiente: registra pago + extiende suscripción
    // (+ asigna plan nuevo si el pago trae target_plan_id, upgrade)
    if (body.subscription_action === 'confirm_payment' && body.payment_id) {
      let result
      try {
        result = await recordSubscriptionPayment({
          adminClient,
          user_id: id,
          amount: 0,
          payment_id: body.payment_id,
        })
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400, headers: supabaseResponse.headers })
      }

      const { data: plan } = await adminClient.from('plans').select('name').eq('id', result.subscription.plan_id).maybeSingle()
      const common = { userId: id, plan: plan?.name || undefined, endsAt: result.subscription.ends_at.slice(0, 10), actorUserId: guard.userId }
      if (result.is_upgrade) {
        notifyPlanUpdated(adminClient, null, common).catch(err => console.error('[admin users] notify plan:', err))
      } else {
        notifyPaymentApproved(adminClient, null, common).catch(err => console.error('[admin users] notify payment:', err))
      }
    }

    // Rechazar una solicitud de pago pendiente
    if (body.subscription_action === 'reject_payment' && body.payment_id) {
      const { data: payment, error: payErr } = await adminClient
        .from('subscription_payments')
        .select('id')
        .eq('id', body.payment_id)
        .eq('user_id', id)
        .eq('status', 'pending')
        .maybeSingle()
      if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500, headers: supabaseResponse.headers })
      if (!payment) {
        return NextResponse.json({ error: 'Solicitud de pago no encontrada o ya procesada' }, { status: 400, headers: supabaseResponse.headers })
      }

      const { error: rejectErr } = await adminClient
        .from('subscription_payments')
        .update({ status: 'rejected' })
        .eq('id', payment.id)
      if (rejectErr) return NextResponse.json({ error: rejectErr.message }, { status: 500, headers: supabaseResponse.headers })

      const { error: auditErr } = await adminClient.from('audit_logs').insert({
        user_id: id,
        action: 'subscription.rejected',
        entity_type: 'subscription_payment',
        entity_id: payment.id,
        details: { reason: body.reason || null },
      })
      if (auditErr) return NextResponse.json({ error: auditErr.message }, { status: 500, headers: supabaseResponse.headers })
    }

    // Asignar/renovar suscripción (con prorrateo si aplica)
    if (body.plan_id) {
      const { data: plan } = await adminClient.from('plans').select('*').eq('id', body.plan_id).single()
      const isTrial = plan?.price === 0 || /trial|prueba/i.test(plan?.name || '')
      const isMonthly = plan?.billing_cycle === 'monthly'
      const days = body.days ? Number(body.days) : isMonthly ? 30 : 365
      const newPeriodMs = days * 24 * 60 * 60 * 1000

      // Prorrateo: si el usuario tiene una suscripción activa/pagada en otro plan,
      // conservar el valor restante (días_restantes * precio_anterior / precio_nuevo) en lugar de reiniciar.
      let proratedMs: number | null = null
      if (body.prorate && !isTrial) {
        const { data: prevSub } = await adminClient
          .from('subscriptions')
          .select('plan_id, ends_at')
          .eq('user_id', id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (prevSub && prevSub.plan_id !== body.plan_id && prevSub.ends_at && new Date(prevSub.ends_at).getTime() > Date.now()) {
          const { data: prevPlan } = await adminClient.from('plans').select('price').eq('id', prevSub.plan_id).single()
          const [oldPrice, newPrice] = [Number(prevPlan?.price || 0), Number(plan?.price || 0)]
          const remainingDays = Math.max(0, (new Date(prevSub.ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          if (oldPrice > 0 && newPrice > 0) {
            proratedMs = Math.min(newPeriodMs, (remainingDays * oldPrice / newPrice) * 24 * 60 * 60 * 1000)
          }
        }
      }

      const { error: subErr } = await adminClient.from('subscriptions').insert({
        user_id: id,
        plan_id: body.plan_id,
        status: isTrial ? 'trial' : 'active',
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + (proratedMs ?? newPeriodMs)).toISOString(),
      })
      if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500, headers: supabaseResponse.headers })

      notifyPlanUpdated(adminClient, null, {
        userId: id,
        plan: plan?.name || undefined,
        endsAt: new Date(Date.now() + (proratedMs ?? newPeriodMs)).toISOString().slice(0, 10),
        actorUserId: guard.userId,
      }).catch(err => console.error('[admin users] notify plan:', err))
    }

    return NextResponse.json({ ok: true }, supabaseResponse)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}
