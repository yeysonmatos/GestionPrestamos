import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { searchParams } = new URL(request.url)
  const months = Math.max(3, Math.min(24, Number(searchParams.get('months') || 12)))

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - (months - 1))
  cutoff.setDate(1)
  cutoff.setHours(0, 0, 0, 0)

  try {
    const { data, error } = await adminClient.rpc('admin_usage_stats', {
      p_from_month: cutoff.toISOString().slice(0, 10),
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })
    if (!data) return NextResponse.json({ error: 'Sin resultados' }, { status: 500, headers: supabaseResponse.headers })

    // Rellenar los meses faltantes del rango para que la gráfica no salte meses
    const revenue_map = new Map<string, number>()
    ;((data.revenue_by_month || []) as { month: string; income: number }[]).forEach(r => {
      revenue_map.set(r.month, Number(r.income))
    })
    const monthLabels: string[] = []
    for (let i = 0; i < months; i++) {
      const d = new Date(cutoff)
      d.setMonth(cutoff.getMonth() + i)
      monthLabels.push(d.toISOString().slice(0, 7))
    }
    const revenue_by_month = monthLabels.map(key => ({
      month: key,
      income: Math.round(revenue_map.get(key) || 0),
    }))

    return NextResponse.json({
      revenue_by_month,
      users_per_plan: (data.users_per_plan || []) as { plan_id: string; name: string; count: number }[],
      conversion_rate: data.conversion_rate,
      trial_count: data.trial_count,
      active_count: data.active_count,
      expired_count: data.expired_count,
      blocked_count: data.blocked_count,
      total_clients: data.total_clients,
      paid_users: data.paid_users,
      mrr: data.mrr,
      total_collected: data.total_collected,
      recent_payments: (data.recent_payments || []) as { id: string; user_label: string; amount: number; payment_date: string; method: string }[],
    }, supabaseResponse)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}