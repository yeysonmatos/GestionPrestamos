import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(request: NextRequest) {
  const { supabase } = await createRouteHandlerClient(request)

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const { supabase } = await createRouteHandlerClient(request)
  const body = await request.json()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const fullName = `${body.first_name || ''} ${body.last_name || ''}`.trim()

  const { data, error } = await supabase
    .from('clients')
    .insert({
      user_id: user.id,
      name: fullName || body.name,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      nickname: body.nickname || null,
      sex: body.sex || null,
      document_type: body.document_type || null,
      document: body.document || null,
      phone: body.phone || null,
      phone_alt: body.phone_alt || null,
      whatsapp: body.whatsapp || null,
      email: body.email || null,
      provincia: body.provincia || null,
      municipio: body.municipio || null,
      sector: body.sector || null,
      calle: body.calle || null,
      numero: body.numero || null,
      referencia: body.referencia || null,
      occupation: body.occupation || null,
      workplace: body.workplace || null,
      monthly_income: body.monthly_income || 0,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
