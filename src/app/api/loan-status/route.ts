import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { rateLimitByIp, addRateLimitHeaders } from '@/lib/rate-limit'
import { computeLateStatus } from '@/lib/loan-status'

export async function POST(request: NextRequest) {
  const rl = rateLimitByIp(request, 'loan-status:update', 30, 60 * 60 * 1000)
  if (!rl.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 }),
      rl
    )
  }

  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data: loans } = await supabase
    .from('loans')
    .select('id')
    .in('status', ['active', 'late', 'late_1_30', 'late_31_60', 'late_61_90'])
    .is('deleted_at', null)

  if (!loans || loans.length === 0) {
    return addRateLimitHeaders(NextResponse.json({ updated: 0 }, supabaseResponse), rl)
  }

  let updatedCount = 0

  for (const loan of loans) {
    const { data: installments } = await supabase
      .from('installments')
      .select('due_date')
      .eq('loan_id', loan.id)
      .in('status', ['pending', 'partial', 'late'])

    if (!installments || installments.length === 0) continue

    const late = computeLateStatus(installments.map(i => i.due_date))
    if (!late) continue

    const { error } = await supabase.from('loans').update({
      status: late.status,
      late_days: late.lateDays,
    }).eq('id', loan.id)

    if (!error) updatedCount++
  }

  return addRateLimitHeaders(NextResponse.json({ updated: updatedCount }, supabaseResponse), rl)
}