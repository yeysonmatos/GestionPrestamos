import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  let query = supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .order('due_date', { ascending: true })

  if (month) {
    query = query.gte('due_date', `${month}-01`).lt('due_date', `${month}-32`)
  }

  const { data: installments, error: err1 } = await query

  const { data: payments, error: err2 } = await supabase
    .from('payments')
    .select('*, loan:loans(client:clients(*))')
    .eq('status', 'paid')
    .order('payment_date', { ascending: false })

  if (err1 || err2) {
    return NextResponse.json({ error: 'Failed to fetch calendar data' }, { status: 500 })
  }

  return NextResponse.json({ installments: installments || [], payments: payments || [] }, supabaseResponse)
}
