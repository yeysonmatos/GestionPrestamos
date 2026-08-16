import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { getLocalDate, firstOfNextMonth } from '@/lib/utils'

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = headers.map(csvEscape).join(',')
  const body = rows.map(r => r.map(csvEscape).join(',')).join('\n')
  return `${head}\n${body}`
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'users'
  const month = searchParams.get('month') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const userId = searchParams.get('user_id') || ''
  const method = searchParams.get('method') || ''
  const status = searchParams.get('status') || ''

  try {
    if (type === 'payments') {
      let query = adminClient
        .from('subscription_payments')
        .select('id, user_id, amount, payment_date, method, status, notes, created_at')
        .order('payment_date', { ascending: false })
        .limit(1000)
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        query = query.gte('payment_date', `${month}-01`).lt('payment_date', firstOfNextMonth(month))
      }
      if (userId) query = query.eq('user_id', userId)
      if (method) query = query.eq('method', method)
      if (status) query = query.eq('status', status)

      const { data: payments, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

      const userIds = [...new Set((payments || []).map(p => p.user_id))]
      const { data: appUsers } = userIds.length
        ? await adminClient.from('app_users').select('id, display_name').in('id', userIds)
        : { data: [] }
      const nameMap = new Map((appUsers || []).map(u => [u.id, u.display_name || '—']))

      const csv = buildCsv(
        ['Fecha', 'Usuario', 'Monto (RD$)', 'Método', 'Estado', 'Notas'],
        (payments || []).map(p => [p.payment_date, nameMap.get(p.user_id) || '—', Number(p.amount), p.method, p.status, p.notes])
      )
      const fileName = `pagos-suscripcion-${getLocalDate()}.csv`
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      })
    }

    if (type === 'audit') {
      let query = adminClient
        .from('audit_logs')
        .select('id, user_id, action, entity_type, entity_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (userId) query = query.eq('user_id', userId)
      if (from) query = query.gte('created_at', new Date(from).toISOString())
      if (to) query = query.lte('created_at', new Date(to + 'T23:59:59.999').toISOString())

      const { data: logs, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

      const userIds = [...new Set((logs || []).map(l => l.user_id))]
      const { data: appUsers } = userIds.length
        ? await adminClient.from('app_users').select('id, display_name').in('id', userIds)
        : { data: [] }
      const nameMap = new Map((appUsers || []).map(u => [u.id, u.display_name || '—']))

      const csv = buildCsv(
        ['Fecha', 'Usuario', 'Acción', 'Entidad', 'Detalle'],
        (logs || []).map(l => [
          l.created_at,
          nameMap.get(l.user_id) || '—',
          l.action,
          l.entity_type,
          JSON.stringify(l.details || {}),
        ])
      )
      const fileName = `auditoria-${getLocalDate()}.csv`
      return new NextResponse('\uFEFF' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      })
    }

    // users (default)
    const [{ data: authRows }, { data: appUsers }, { data: subscriptions }, { data: plans }] = await Promise.all([
      adminClient.rpc('admin_list_users'),
      adminClient.from('app_users').select('id, role, status, display_name'),
      adminClient.from('subscriptions').select('user_id, plan_id, status, ends_at'),
      adminClient.from('plans').select('id, name, price'),
    ])

    const planMap = new Map<string, { id: string; name: string; price: number }>((plans || []).map(p => [p.id, p]))
    const metaMap = new Map<string, { display_name?: string; role?: string; status?: string }>((appUsers || []).map(u => [u.id, u]))
    const latestSub = new Map<string, { plan_id: string | null; status: string; ends_at: string | null }>()
    ;(subscriptions || []).forEach(s => {
      if (!latestSub.has(s.user_id)) latestSub.set(s.user_id, s)
    })

    const csv = buildCsv(
      ['Email', 'Nombre', 'Rol', 'Estado', 'Plan', 'Estado suscripción', 'Vence'],
      ((authRows || []) as { id: string; email: string }[]).map(au => {
        const meta = metaMap.get(au.id)
        const sub = latestSub.get(au.id)
        return [
          au.email,
          meta?.display_name || '',
          meta?.role || 'client',
          meta?.status || 'active',
          sub?.plan_id ? planMap.get(sub.plan_id)?.name || '—' : 'Sin plan',
          sub?.status || '',
          sub?.ends_at || '',
        ]
      })
    )
    const fileName = `usuarios-${getLocalDate()}.csv`
    return new NextResponse('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: supabaseResponse.headers })
  }
}
