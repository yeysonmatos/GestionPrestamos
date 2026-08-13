import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('loan_id', id)
    .order('payment_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: loan_id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json()
  const amount = Number(body.amount)
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Monto es requerido' }, { status: 400 })
  }

  // Verificar que el préstamo pertenezca al usuario
  const { data: loan } = await supabase
    .from('loans')
    .select('id, client_id, open_ended, amortization_type')
    .eq('id', loan_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }

  // Pago de cuota con el motor transaccional (recalcula cuota + préstamo + stats)
  if (body.installment_id) {
    const { data: settings } = await supabase
      .from('settings')
      .select('late_interest_rate, grace_days')
      .eq('user_id', user.id)
      .maybeSingle()

    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_installment_payment', {
      p_loan_id: loan_id,
      p_installment_id: body.installment_id,
      p_user_id: user.id,
      p_amount: amount,
      p_include_mora: body.include_mora ?? true,
      p_payment_date: body.payment_date || new Date().toISOString().split('T')[0],
      p_method: body.method || 'cash',
      p_notes: body.notes || null,
      p_late_interest_rate: settings?.late_interest_rate ?? 0,
      p_grace_days: settings?.grace_days ?? 0,
    })
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })
    if (!rpcResult?.ok) return NextResponse.json({ error: rpcResult?.error || 'Error al procesar el pago' }, { status: 400 })

    return NextResponse.json({ ok: true, payment: rpcResult.payment, loan: rpcResult.loan, allocation: rpcResult.allocation }, supabaseResponse)
  }

  // Pago de interés en préstamo open-ended (sin cuotas)
  const { data, error } = await supabase
    .from('payments')
    .insert({
      loan_id,
      client_id: loan.client_id,
      user_id: user.id,
      amount,
      capital_amount: Number(body.capital_amount || 0),
      interest_amount: Number(body.interest_amount || amount),
      payment_date: body.payment_date || new Date().toISOString().split('T')[0],
      method: body.method || 'cash',
      notes: body.notes || null,
      type: 'installment',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, supabaseResponse)
}
