import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { id } = await params

  const { data, error } = await adminClient
    .from('subscriptions')
    .select('id, status, plan_id, plans(name, price, billing_cycle), starts_at, ends_at, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

  const history = (data || []).map(s => {
    const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans
    return {
      id: s.id,
      status: s.status,
      plan_name: plan?.name || '—',
      plan_price: Number(plan?.price || 0),
      billing_cycle: plan?.billing_cycle || 'monthly',
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      created_at: s.created_at,
    }
  })

  return NextResponse.json({ history }, supabaseResponse)
}