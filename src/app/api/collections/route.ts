import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { rateLimitByIp, addRateLimitHeaders } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const today = new Date().toISOString().split('T')[0]

  const { data: todayInstallments, error: err1 } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .eq('due_date', today)
    .in('status', ['pending', 'partial', 'late'])

  const { data: overdueInstallments, error: err2 } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .in('status', ['pending', 'partial', 'late'])
    .lt('due_date', today)

  const { data: upcomingInstallments, error: err3 } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .in('status', ['pending', 'partial', 'late'])
    .gte('due_date', today)

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
  const body = await request.json()

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      loan_id: body.loan_id,
      installment_id: body.installment_id || null,
      client_id: body.client_id,
      amount: body.amount,
      capital_amount: body.capital_amount || 0,
      interest_amount: body.interest_amount || 0,
      late_amount: body.late_amount || 0,
      payment_date: body.payment_date,
      method: body.method || 'cash',
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) return addRateLimitHeaders(NextResponse.json({ error: error.message }, { status: 500 }), rl)

  if (body.installment_id) {
    await supabase
      .from('installments')
      .update({ status: 'paid', paid_at: body.payment_date, paid_amount: body.amount })
      .eq('id', body.installment_id)
  }

  return addRateLimitHeaders(NextResponse.json(payment, supabaseResponse), rl)
}
