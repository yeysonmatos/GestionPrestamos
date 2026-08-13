import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { notifyPlanExpiring } from '@/lib/notify/actions'

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard

  try {
    const [{ data: appUsers, error: appErr }, { data: subscriptions, error: subErr }, { data: plans, error: planErr }] = await Promise.all([
      adminClient.from('app_users').select('id, display_name'),
      adminClient.from('subscriptions').select('*').not('status', 'eq', 'cancelled'),
      adminClient.from('plans').select('*'),
    ])

    if (appErr || subErr || planErr) {
      return NextResponse.json({ error: appErr?.message || subErr?.message || planErr?.message || 'Error' }, { status: 500, headers: supabaseResponse.headers })
    }

    const planMap = new Map((plans || []).map(p => [p.id, p]))
    const nameMap = new Map((appUsers || []).map(u => [u.id, u.display_name || null]))
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    // Solo la suscripción más reciente por usuario (misma lógica que la lista de Usuarios)
    const latestByUser = new Map<string, Record<string, unknown>>()
    for (const s of (subscriptions || [])) {
      if (!(s.status === 'active' || s.status === 'trial' || s.status === 'expired')) continue
      const prev = latestByUser.get(s.user_id)
      if (!prev || new Date(s.created_at).getTime() >= new Date(prev.created_at as string).getTime()) {
        latestByUser.set(s.user_id, s)
      }
    }

    const reminders = Array.from(latestByUser.values())
      .map(s => {
        const ends = s.ends_at ? new Date(s.ends_at as string).getTime() : null
        const daysLeft = ends ? Math.ceil((ends - now) / dayMs) : null
        return {
          id: s.id,
          user_id: s.user_id,
          user_name: nameMap.get(s.user_id as string) || '—',
          plan_id: s.plan_id,
          plan_name: planMap.get(s.plan_id as string)?.name || '—',
          status: s.status,
          ends_at: s.ends_at,
          days_left: daysLeft,
        }
      })
      .filter(r => r.days_left !== null && (r.days_left <= 7 || r.status === 'expired'))
      .sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0))

    return NextResponse.json({ reminders }, supabaseResponse)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const body = await request.json().catch(() => ({}))
  const { subscription_ids } = body

  try {
    let query = adminClient
      .from('subscriptions')
      .select('id, user_id, status, ends_at, plans(name)')
      .not('status', 'eq', 'cancelled')

    let ids: string[] = Array.isArray(subscription_ids) && subscription_ids.length
      ? subscription_ids
      : []
    if (!ids.length) {
      // Misma lógica que la lista: una sub (la más reciente) por usuario
      const { data: all } = await adminClient.from('subscriptions').select('id, user_id, created_at').not('status', 'eq', 'cancelled')
      const latest = new Map<string, { id: string; created_at: string }>()
      for (const s of (all || [])) {
        const prev = latest.get(s.user_id)
        if (!prev || new Date(s.created_at).getTime() >= new Date(prev.created_at).getTime()) {
          latest.set(s.user_id, { id: s.id, created_at: s.created_at })
        }
      }
      ids = Array.from(latest.values()).map(s => s.id)
    }

    if (ids.length) query = query.in('id', ids)

    const { data: subs, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

    const { data: authUsers } = await adminClient.rpc('admin_list_users')
    const emailMap = new Map<string, string>((authUsers as { id: string; email: string }[] || []).map(u => [u.id, u.email]))

    let sent = 0
    let failed = 0

    for (const s of (subs || [])) {
      const plan: { name?: string } | null = Array.isArray(s.plans) ? s.plans[0] as { name?: string } : s.plans as { name?: string } | null
      const email = emailMap.get(s.user_id as string)
      if (!email) { failed++; continue }
      const endsAt = typeof s.ends_at === 'string' ? s.ends_at : null
      const daysLeft = endsAt ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null
      const id = await notifyPlanExpiring(adminClient, null, {
        userId: s.user_id as string,
        plan: plan?.name || undefined,
        endsAt: endsAt?.slice(0, 10) || undefined,
        days: daysLeft !== null ? Math.max(0, daysLeft) : undefined,
        expired: daysLeft !== null && daysLeft <= 0,
        actorUserId: guard.userId,
      })
      if (id) sent++
      else failed++
    }

    return NextResponse.json({ ok: true, sent, failed }, supabaseResponse)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}
