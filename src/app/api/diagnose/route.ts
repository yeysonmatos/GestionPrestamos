import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No auth' }, { status: 401 })

  const { data: loans } = await supabase.from('loans').select('*, clients(name)').limit(5)
  const { data: payments } = await supabase.from('payments').select('*').limit(20).order('created_at', { ascending: false })
  const { data: installments } = await supabase.from('installments').select('*').limit(20).order('number')

  return NextResponse.json({
    user: user.email,
    loans,
    payments,
    installments,
  }, supabaseResponse)
}
