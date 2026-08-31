import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { requireActiveSubscriptionApi } from '@/lib/subscription-guard'

export async function GET(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data, error } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}

export async function POST(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const guard = await requireActiveSubscriptionApi({ supabase, supabaseResponse })
  if (!guard.ok) return guard.response

  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Validación de entrada: montos deben ser números positivos finitos.
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
  }
  const totalAmount = Number.isFinite(Number(body.total_amount)) ? Number(body.total_amount) : amount
  const totalInterest = Number.isFinite(Number(body.total_interest)) ? Number(body.total_interest) : 0
  const installmentAmount = Number.isFinite(Number(body.installment_amount)) ? Number(body.installment_amount) : 0

  // Validar que el cliente pertenezca al usuario (evita asociar préstamos a clientes ajenos)
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', body.client_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!client) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('loans')
    .insert({
      user_id: user.id,
      client_id: body.client_id,
      loan_id: body.loan_id,
      amount,
      interest_type: body.interest_type || 'percentage',
      interest_rate: Number.isFinite(Number(body.interest_rate)) ? Number(body.interest_rate) : 0,
      total_amount: totalAmount,
      total_interest: totalInterest,
      installment_amount: installmentAmount,
      remaining_amount: amount,
      installments: Number.isFinite(Number(body.installments)) ? Number(body.installments) : 0,
      frequency: body.frequency || 'monthly',
      start_date: body.start_date,
      first_payment_date: body.first_payment_date,
      amortization_type: body.amortization_type || 'interest_only',
      open_ended: body.open_ended || false,
      payment_day: body.payment_day || null,
      guarantee: body.guarantee || null,
      notes: body.notes || null,
    })
    .select('*, client:clients(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}
