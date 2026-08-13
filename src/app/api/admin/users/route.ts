import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'

interface SubscriptionRow {
  id: string
  user_id: string
  plan_id: string | null
  status: string
  starts_at: string
  ends_at: string | null
  created_at: string
}

interface AdminUserRow {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard

  try {
    const [{ data: authRows, error: authError }, { data: appUsers, error: appError }, { data: subs, error: subError }, { data: plans, error: planError }, { data: usage, error: usageError }] = await Promise.all([
      adminClient.rpc('admin_list_users'),
      adminClient.from('app_users').select('*'),
      adminClient.from('subscriptions').select('*'),
      adminClient.from('plans').select('*'),
      adminClient.rpc('admin_usage_by_user'),
    ])

    if (authError || appError || subError || planError || usageError) {
      return NextResponse.json(
        { error: authError?.message || appError?.message || subError?.message || planError?.message || usageError?.message || 'Error al cargar usuarios' },
        { status: 500, headers: supabaseResponse.headers }
      )
    }

    // Métricas de uso por usuario (ya agregadas en SQL)
    const usageByUser = new Map<string, { loans_count: number; clients_count: number; payments_count: number; last_activity_at: string | null }>()
    ;(usage || []).forEach((u: { user_id: string; loans_count: number; clients_count: number; payments_count: number; last_activity_at: string | null }) => {
      usageByUser.set(u.user_id, {
        loans_count: Number(u.loans_count) || 0,
        clients_count: Number(u.clients_count) || 0,
        payments_count: Number(u.payments_count) || 0,
        last_activity_at: u.last_activity_at || null,
      })
    })

    const appUserMap = new Map((appUsers || []).map(u => [u.id, u]))
    const planMap = new Map((plans || []).map(p => [p.id, p]))
    const subByUser = new Map<string, SubscriptionRow[]>()
    ;(subs || []).forEach(s => {
      const list = subByUser.get(s.user_id) || []
      list.push(s)
      subByUser.set(s.user_id, list)
    })

    const users = ((authRows || []) as AdminUserRow[]).map(au => {
      const meta = appUserMap.get(au.id) || {}
      const userSubs = (subByUser.get(au.id) || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const current = userSubs[0] || null
      return {
        id: au.id,
        email: au.email,
        created_at: au.created_at,
        last_sign_in_at: au.last_sign_in_at,
        role: meta.role || 'client',
        display_name: meta.display_name || au.email,
        status: meta.status || 'active',
        usage: usageByUser.get(au.id) || { loans_count: 0, clients_count: 0, payments_count: 0, last_activity_at: null },
        subscription: current
          ? {
              id: current.id,
              plan_id: current.plan_id,
              plan_name: planMap.get(current.plan_id)?.name || '—',
              plan_price: planMap.get(current.plan_id)?.price || 0,
              billing_cycle: planMap.get(current.plan_id)?.billing_cycle || 'monthly',
              status: current.status,
              starts_at: current.starts_at,
              ends_at: current.ends_at,
            }
          : null,
      }
    })

    return NextResponse.json({ users }, supabaseResponse)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const body = await request.json().catch(() => ({}))
  const { email, password, plan_id, display_name } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400, headers: supabaseResponse.headers })
  }

  try {
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: display_name || email },
    })
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500, headers: supabaseResponse.headers })

    const userId = created.user.id

    const { error: appErr } = await adminClient.from('app_users').insert({
      id: userId,
      role: 'client',
      display_name: display_name || email,
      status: 'active',
    })
    if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500, headers: supabaseResponse.headers })

    if (plan_id) {
      const { data: plan } = await adminClient.from('plans').select('*').eq('id', plan_id).single()
      const isMonthly = plan?.billing_cycle === 'monthly'
      const { error: subErr } = await adminClient.from('subscriptions').insert({
        user_id: userId,
        plan_id,
        status: 'active',
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + (isMonthly ? 30 : 365) * 24 * 60 * 60 * 1000).toISOString(),
      })
      if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500, headers: supabaseResponse.headers })
    } else {
      const { data: trialPlan } = await adminClient
        .from('plans')
        .select('id')
        .ilike('name', '%trial%')
        .limit(1)
        .maybeSingle()
      const trialPlanId = trialPlan?.id
      const { error: trialErr } = await adminClient.from('subscriptions').insert({
        user_id: userId,
        plan_id: trialPlanId,
        status: 'trial',
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      if (trialErr) return NextResponse.json({ error: trialErr.message }, { status: 500, headers: supabaseResponse.headers })
    }

    return NextResponse.json({ ok: true, user: created.user }, supabaseResponse)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}
