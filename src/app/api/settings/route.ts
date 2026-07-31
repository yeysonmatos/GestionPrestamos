import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { rateLimitByIp } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}

export async function PUT(request: NextRequest) {
  if (!rateLimitByIp(request, 'settings:update', 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 })
  }

  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const body = await request.json()

  const numericKeys = ['late_interest_rate', 'notify_upcoming_days', 'default_installments', 'grace_days']
  for (const key of numericKeys) {
    if (key in body) {
      const value = Number(body[key])
      body[key] = Number.isFinite(value) ? Math.max(0, value) : 0
    }
  }

  const { data: existing } = await supabase
    .from('settings')
    .select('id')
    .single()

  let result
  if (existing) {
    const { data, error } = await supabase
      .from('settings')
      .update(body)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  } else {
    const { data, error } = await supabase
      .from('settings')
      .insert(body)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  }

  return NextResponse.json(result, supabaseResponse)
}
