import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { recordSubscriptionPayment, BillingError } from '@/lib/billing'
import { notifyPaymentApproved, notifyPlanUpdated } from '@/lib/notify/actions'
import { firstOfNextMonth } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || ''
  const method = searchParams.get('method') || ''
  const userId = searchParams.get('user_id') || ''
  const status = searchParams.get('status') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
  const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('page_size') || '20') || 20))

  // Filtro por fecha compartido entre count y data
  const dateFilter = (query: any, col = 'payment_date') => {
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      query = query.gte(col, `${month}-01`).lt(col, firstOfNextMonth(month))
    }
    return query
  }

  let countQuery = dateFilter(
    adminClient.from('subscription_payments').select('id', { count: 'exact', head: true }),
    'payment_date'
  ) as any
  if (method) countQuery = countQuery.eq('method', method)
  if (userId) countQuery = countQuery.eq('user_id', userId)
  if (status) countQuery = countQuery.eq('status', status)
  const countRes = await countQuery
  const total = countRes.count || 0

  // Conteos globales por estado (independientes de la página)
  const [pendingCount, confirmedCount, rejectedCount, summaryRes] = await Promise.all([
    adminClient.from('subscription_payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    adminClient.from('subscription_payments').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
    adminClient.from('subscription_payments').select('amount').neq('status', 'rejected'),
    adminClient.from('subscription_payments').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
  ])
  const summarized = (summaryRes.data || []) as unknown as { amount: number }[]
  const totalAmount = summarized.reduce((s, p) => s + Number(p.amount), 0)

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  let query = dateFilter(
    adminClient
      .from('subscription_payments')
      .select('*')
      .order('payment_date', { ascending: false })
      .range(from, to)
  )
  if (method) query = query.eq('method', method)
  if (userId) query = query.eq('user_id', userId)
  if (status) query = query.eq('status', status)
  if (countRes.error) return NextResponse.json({ error: countRes.error.message }, { status: 500, headers: supabaseResponse.headers })

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

  const rows = (data || []) as unknown as { user_id: string }[]
  const userIds = [...new Set(rows.map(p => p.user_id))]
  const { data: appUsers } = userIds.length
    ? await adminClient.from('app_users').select('id, display_name').in('id', userIds as never[])
    : { data: [] }

  const userMap = new Map((appUsers || []).map(u => [u.id, u.display_name || '—']))

  const payments = rows.map(p => ({ ...(p as object), user_label: userMap.get(p.user_id) || '—' }))

  return NextResponse.json({
    payments,
    total,
    page,
    page_size: pageSize,
    total_amount: totalAmount,
    counts: {
      pending: pendingCount.count || 0,
      confirmed: confirmedCount.count || 0,
      rejected: rejectedCount.count || 0,
    },
  }, supabaseResponse)
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const body = await request.json().catch(() => ({}))
  const { user_id, subscription_id, amount, method, notes } = body

  if (!user_id || !amount) {
    return NextResponse.json({ error: 'Usuario y monto son requeridos' }, { status: 400, headers: supabaseResponse.headers })
  }

  try {
    const result = await recordSubscriptionPayment({
      adminClient,
      user_id,
      subscription_id,
      amount: Number(amount),
      payment_date: body.payment_date,
      method,
      notes,
      target_plan_id: body.target_plan_id,
    })

    // Notificar al prestamista (pago aprobado / plan actualizado)
    const { data: plan } = await adminClient.from('plans').select('name').eq('id', result.subscription.plan_id).maybeSingle()
    const common = { userId: user_id, plan: plan?.name || undefined, endsAt: result.subscription.ends_at.slice(0, 10), actorUserId: guard.userId }
    if (result.is_upgrade) {
      notifyPlanUpdated(adminClient, null, common).catch(err => console.error('[admin payments] notify plan:', err))
    } else {
      notifyPaymentApproved(adminClient, null, common).catch(err => console.error('[admin payments] notify payment:', err))
    }

    return NextResponse.json({ ok: true, payment_id: result.payment_id }, supabaseResponse)
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: 400, headers: supabaseResponse.headers })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}
