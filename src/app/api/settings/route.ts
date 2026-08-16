import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { rateLimitByIp, addRateLimitHeaders } from '@/lib/rate-limit'

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
  const rl = rateLimitByIp(request, 'settings:update', 10, 60 * 60 * 1000)
  if (!rl.allowed) {
    return addRateLimitHeaders(
      NextResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 }),
      rl
    )
  }

  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  // Whitelist de columnas: evita que el cliente escriba campos gestionados por
  // el sistema (onboarding_completed, related user_id, plan/suscripción, etc.).
  const ALLOWED = [
    'business_name', 'currency', 'loan_id_prefix', 'late_interest_rate',
    'notify_upcoming_days', 'default_installments', 'default_interest_rate',
    'default_frequency', 'grace_days', 'phone', 'email', 'address',
  ]
  const patch: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key]
  }

  const numericKeys = ['late_interest_rate', 'notify_upcoming_days', 'default_installments', 'grace_days']
  for (const key of numericKeys) {
    if (key in patch) {
      const value = Number(patch[key])
      patch[key] = Number.isFinite(value) ? Math.max(0, value) : 0
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
      .update(patch)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  } else {
    const { data, error } = await supabase
      .from('settings')
      .insert(patch)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  }

  return addRateLimitHeaders(NextResponse.json(result, supabaseResponse), rl)
}
