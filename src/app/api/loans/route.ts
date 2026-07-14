import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(request: NextRequest) {
  const { supabase } = await createRouteHandlerClient(request)

  const { data, error } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const { supabase } = await createRouteHandlerClient(request)
  const body = await request.json()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('loans')
    .insert({
      user_id: user.id,
      client_id: body.client_id,
      loan_id: body.loan_id,
      amount: body.amount,
      interest_type: body.interest_type || 'percentage',
      interest_rate: body.interest_rate || 0,
      total_amount: body.total_amount,
      total_interest: body.total_interest,
      installment_amount: body.installment_amount,
      remaining_amount: body.amount,
      installments: body.installments || 0,
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
  return NextResponse.json(data)
}
