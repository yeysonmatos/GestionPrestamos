import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data, error } = await supabase
    .from('documents')
    .select('*, client:clients(id, name)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}

export async function POST(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const body = await request.json()

  const { data, error } = await supabase
    .from('documents')
    .insert({
      client_id: body.client_id || null,
      loan_id: body.loan_id || null,
      name: body.name,
      type: body.type || 'note',
      path: body.path,
      mime_type: body.mime_type || null,
      size: body.size || null,
      notes: body.notes || null,
    })
    .select('*, client:clients(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}

export async function DELETE(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'Document ID required' }, { status: 400 })

  const { error } = await supabase.from('documents').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true }, supabaseResponse)
}
