import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001'
const FIELDS = 'bank_name, account_name, account_number, payment_phone'

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { data, error } = await adminClient
    .from('platform_config')
    .select(FIELDS)
    .eq('id', SINGLETON_ID)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

  return NextResponse.json({
    config: data || { bank_name: '', account_name: '', account_number: '', payment_phone: '' },
  }, supabaseResponse)
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const body = await request.json().catch(() => ({}))
  const payload: Record<string, string> = {}
  for (const key of ['bank_name', 'account_name', 'account_number', 'payment_phone'] as const) {
    if (typeof body[key] === 'string') payload[key] = body[key]
  }

  const { data, error } = await adminClient
    .from('platform_config')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', SINGLETON_ID)
    .select(FIELDS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

  return NextResponse.json({ ok: true, config: data }, supabaseResponse)
}