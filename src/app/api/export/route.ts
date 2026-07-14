import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data: loans, error } = await supabase
    .from('loans')
    .select('*, person:people(*), payments(*)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const header = 'Persona,Monto,Moneda,Interés,Descripción,Fecha,Estado,Total Pagado,Pendiente\n'
  const rows = (loans || []).map(l => {
    const totalPaid = (l.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
    const remaining = Number(l.amount) - totalPaid
    return `"${l.person?.name || 'Sin nombre'}",${l.amount},${l.currency},${l.interest_rate}%,"${l.description || ''}",${l.date},${l.status},${totalPaid},${remaining}`
  }).join('\n')

  const csv = header + rows

  const fileName = `prestamos-${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
