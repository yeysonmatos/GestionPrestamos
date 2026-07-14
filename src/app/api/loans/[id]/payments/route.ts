import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('loan_id', id)
    .order('date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: loan_id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const body = await request.json()

  const { data, error } = await supabase
    .from('payments')
    .insert({
      loan_id,
      amount: body.amount,
      notes: body.notes || '',
      date: body.date || new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: loan } = await supabase
    .from('loans')
    .select('amount')
    .eq('id', loan_id)
    .single()

  if (loan) {
    const { data: allPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('loan_id', loan_id)

    const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount), 0)
    if (totalPaid >= Number(loan.amount)) {
      await supabase.from('loans').update({ status: 'paid' }).eq('id', loan_id)
    }
  }

  return NextResponse.json(data, supabaseResponse)
}
