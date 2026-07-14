import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data: loans } = await supabase.from('loans').select('*')
  const { data: payments } = await supabase.from('payments').select('*').eq('status', 'paid')
  const { data: clients } = await supabase.from('clients').select('*')

  const activeLoans = (loans || []).filter(l => l.status === 'active' || l.status === 'late')
  const paidLoans = (loans || []).filter(l => l.status === 'paid')
  const lateLoans = (loans || []).filter(l => l.status === 'late')

  const totalCapital = activeLoans.reduce((s, l) => s + Number(l.amount), 0)
  const recoveredCapital = paidLoans.reduce((s, l) => s + Number(l.amount), 0)
  const pendingCapital = activeLoans.reduce((s, l) => s + Number(l.remaining_amount), 0)
  const generatedInterest = (loans || []).reduce((s, l) => s + Number(l.total_interest), 0)
  const collectedInterest = (payments || []).reduce((s, p) => s + Number(p.interest_amount), 0)

  const activeClients = (clients || []).filter(c => c.status === 'active').length
  const lateClientIds = new Set(lateLoans.map(l => l.client_id))

  const portfolioHealth = activeLoans.length > 0
    ? Math.round(((activeLoans.length - lateLoans.length) / activeLoans.length) * 100)
    : 100

  // Monthly aggregation
  const monthMap: Record<string, { income: number; loans: number }> = {}
  ;(payments || []).forEach(p => {
    const month = p.payment_date.slice(0, 7)
    if (!monthMap[month]) monthMap[month] = { income: 0, loans: 0 }
    monthMap[month].income += Number(p.amount)
  })
  ;(loans || []).forEach(l => {
    const month = l.created_at?.slice(0, 7)
    if (month && monthMap[month]) {
      monthMap[month].loans += Number(l.amount)
    }
  })

  const monthlyData = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, data]) => ({
      month,
      income: data.income,
      loans: data.loans,
    }))

  return NextResponse.json({
    overview: {
      total_loans: loans?.length || 0,
      total_recovered: recoveredCapital,
      total_pending: pendingCapital,
      total_interest: generatedInterest,
      active_clients: activeClients,
      active_loans: activeLoans.length,
      portfolio_health: portfolioHealth,
    },
    breakdown: {
      total_capital: totalCapital,
      recovered_capital: recoveredCapital,
      pending_capital: pendingCapital,
      generated_interest: generatedInterest,
      collected_interest: collectedInterest,
      late_clients: lateClientIds.size,
    },
    monthly_data: monthlyData,
    status_distribution: [
      { name: 'Activos', value: activeLoans.length },
      { name: 'Pagados', value: paidLoans.length },
      { name: 'Atrasados', value: lateLoans.length },
    ],
  }, supabaseResponse)
}
