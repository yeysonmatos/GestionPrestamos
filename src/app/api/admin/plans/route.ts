import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { data, error } = await adminClient.from('plans').select('*').order('price')
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })
  return NextResponse.json({ plans: data }, supabaseResponse)
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const body = await request.json().catch(() => ({}))

  const { data, error } = await adminClient
    .from('plans')
    .insert({
      name: body.name,
      price: body.price || 0,
      currency: 'DOP',
      billing_cycle: body.billing_cycle || 'monthly',
      description: body.description || null,
      features: Array.isArray(body.features) ? body.features : [],
      max_clients: typeof body.max_clients === 'number' && body.max_clients > 0 ? body.max_clients : null,
      is_active: body.is_active !== false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })
  return NextResponse.json({ plan: data }, supabaseResponse)
}
