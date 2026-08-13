import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const { data, error } = await adminClient
    .from('plans')
    .update({
      name: body.name,
      price: body.price,
      billing_cycle: body.billing_cycle,
      description: body.description ?? null,
      features: Array.isArray(body.features) ? body.features : [],
      max_clients: typeof body.max_clients === 'number' && body.max_clients > 0 ? body.max_clients : null,
      is_active: body.is_active,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })
  return NextResponse.json({ plan: data }, supabaseResponse)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { id } = await params

  const { error } = await adminClient.from('plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })
  return NextResponse.json({ ok: true }, supabaseResponse)
}
