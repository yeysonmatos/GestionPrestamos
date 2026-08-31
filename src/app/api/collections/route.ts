import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { rateLimitByIp, addRateLimitHeaders } from '@/lib/rate-limit'
import { getLocalDate } from '@/lib/utils'
import { requireActiveSubscriptionApi } from '@/lib/subscription-guard'

export async function GET(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const today = getLocalDate()

  const { data: todayInstallments, error: err1 } = await supabase
    .from('installments')
    .select('*, loan:loans!inner(client:clients(*))')
    .eq('due_date', today)
    .in('status', ['pending', 'partial', 'late'])
    .is('loan.deleted_at', null)

  const { data: overdueInstallments, error: err2 } = await supabase
    .from('installments')
    .select('*, loan:loans!inner(client:clients(*))')
    .in('status', ['pending', 'partial', 'late'])
    .lt('due_date', today)
    .is('loan.deleted_at', null)

  const { data: upcomingInstallments, error: err3 } = await supabase
    .from('installments')
    .select('*, loan:loans!inner(client:clients(*))')
    .in('status', ['pending', 'partial', 'late'])
    .gt('due_date', today)
    .is('loan.deleted_at', null)

  if (err1 || err2 || err3) {
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 })
  }

  return NextResponse.json({
    today: todayInstallments || [],
    overdue: overdueInstallments || [],
    upcoming: upcomingInstallments || [],
  }, supabaseResponse)
}

export async function POST(request: NextRequest) {
  const rl = rateLimitByIp(request, 'collections:create', 30, 60 * 1000)
  if (!rl.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 }),
      rl
    )
  }

  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const guard = await requireActiveSubscriptionApi({ supabase, supabaseResponse })
  if (!guard.ok) return addRateLimitHeaders(guard.response, rl)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return addRateLimitHeaders(NextResponse.json({ error: 'No autenticado' }, { status: 401 }), rl)
  }

  const body = await request.json().catch(() => ({}))
  const { loan_id, installment_id, amount, include_mora, payment_date, method, notes } = body

  if (!loan_id || !amount || Number(amount) <= 0) {
    return addRateLimitHeaders(NextResponse.json({ error: 'Préstamo y monto son requeridos' }, { status: 400 }), rl)
  }

  // Verificar que el préstamo pertenezca al usuario
  const { data: loan } = await supabase
    .from('loans')
    .select('id, client_id')
    .eq('id', loan_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!loan) {
    return addRateLimitHeaders(NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 }), rl)
  }

  // Pago de cuota (instalment): usar la función transaccional existente
  if (installment_id) {
    const { data: settings } = await supabase
      .from('settings')
      .select('late_interest_rate, grace_days')
      .eq('user_id', user.id)
      .maybeSingle()

    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_installment_payment', {
      p_loan_id: loan_id,
      p_installment_id: installment_id,
      p_user_id: user.id,
      p_amount: Number(amount),
      p_include_mora: include_mora ?? true,
      p_payment_date: payment_date || getLocalDate(),
      p_method: method || 'cash',
      p_notes: notes || null,
      p_late_interest_rate: settings?.late_interest_rate ?? 0,
      p_grace_days: settings?.grace_days ?? 0,
    })
    if (rpcError) return addRateLimitHeaders(NextResponse.json({ error: rpcError.message }, { status: 500 }), rl)
    if (!rpcResult?.ok) return addRateLimitHeaders(NextResponse.json({ error: rpcResult?.error || 'Error al procesar el pago' }, { status: 400 }), rl)

    return addRateLimitHeaders(NextResponse.json({ ok: true, payment: rpcResult.payment, allocation: rpcResult.allocation }, supabaseResponse), rl)
  }

  // Pago genérico sin cuota (ej. abono directo)
  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      loan_id,
      client_id: loan.client_id,
      user_id: user.id,
      amount: Number(amount),
      capital_amount: Number(body.capital_amount || 0),
      interest_amount: Number(body.interest_amount || 0),
      late_amount: Number(body.late_amount || 0),
      payment_date: payment_date || getLocalDate(),
      method: method || 'cash',
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return addRateLimitHeaders(NextResponse.json({ error: error.message }, { status: 500 }), rl)

  return addRateLimitHeaders(NextResponse.json(payment, supabaseResponse), rl)
}
