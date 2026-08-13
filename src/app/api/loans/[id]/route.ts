import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { logAuditEvent } from '@/lib/audit'
import { computeLateStatus } from '@/lib/loan-status'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data, error } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const body = await request.json()

  const { data: existingLoan, error: fetchError } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !existingLoan)
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  if (existingLoan.paid_installments > 0 || existingLoan.paid_amount > 0)
    return NextResponse.json({ error: 'No se puede editar un préstamo con pagos registrados' }, { status: 400 })

  const criticalFields = ['amount', 'interest_type', 'interest_rate', 'amortization_type', 'open_ended', 'payment_day', 'installments', 'frequency', 'start_date', 'first_payment_date']
  let needsRecalculation = criticalFields.some(f => body[f] !== undefined && String(body[f]) !== String((existingLoan as any)[f]))

  const updateData: Record<string, any> = {}
  for (const key of [...criticalFields, 'guarantee', 'notes']) {
    if (body[key] !== undefined) updateData[key] = body[key]
  }

  const openEnded = body.open_ended ?? existingLoan.open_ended
  const firstPaymentDate = body.first_payment_date ?? existingLoan.first_payment_date
  if (openEnded && updateData.payment_day === undefined) {
    updateData.payment_day = parseInt(firstPaymentDate.split('-')[2]) || null
  }

  if (needsRecalculation) {
    await supabase.from('installments').delete().eq('loan_id', id)

    const amount = parseFloat(body.amount ?? existingLoan.amount)
    const rate = parseFloat(body.interest_rate ?? existingLoan.interest_rate)
    const numInstallments = openEnded ? 0 : parseInt(body.installments ?? existingLoan.installments)
    const amortType = body.amortization_type ?? existingLoan.amortization_type

    const { calculateLoan } = await import('@/lib/calculations')
    const schedule = calculateLoan({
      amount,
      interest_type: body.interest_type ?? existingLoan.interest_type,
      interest_rate: rate,
      installments: numInstallments,
      frequency: body.frequency ?? existingLoan.frequency,
      start_date: body.first_payment_date ?? existingLoan.first_payment_date,
      amortization_type: amortType,
      open_ended: openEnded,
    })

    updateData.total_amount = schedule.total_amount
    updateData.total_interest = schedule.total_interest
    updateData.installment_amount = schedule.installment_amount
    updateData.remaining_amount = openEnded ? amount : schedule.total_amount
    updateData.installments = numInstallments

    if (!openEnded && schedule.installments.length > 0) {
      const installmentsData = schedule.installments.map((inst: any) => ({
        loan_id: id,
        client_id: existingLoan.client_id,
        number: inst.number,
        amount: inst.amount,
        capital: inst.capital,
        interest: inst.interest,
        balance: inst.balance,
        due_date: inst.due_date,
      }))
      const { error: instErr } = await supabase.from('installments').insert(installmentsData)
      if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 })

      const late = computeLateStatus(schedule.installments.map((inst: any) => inst.due_date))
      if (late) {
        updateData.status = late.status
        updateData.late_days = late.lateDays
      }
    }
  }

  const { data, error } = await supabase
    .from('loans')
    .update(updateData)
    .eq('id', id)
    .select('*, client:clients(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const changes: Record<string, unknown> = {}
    const previous: Record<string, unknown> = {}
    for (const key of Object.keys(updateData)) {
      const oldVal = (existingLoan as unknown as Record<string, unknown>)[key]
      const newVal = updateData[key]
      if (newVal !== undefined) {
        if (oldVal instanceof Date) continue
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changes[key] = newVal
          previous[key] = oldVal ?? ''
        }
      }
    }
    const clientName = Array.isArray(existingLoan.client)
      ? existingLoan.client[0]?.name
      : (existingLoan.client as { name?: string } | null)?.name

    await logAuditEvent(supabase, {
      userId: user.id,
      action: 'loan.updated',
      entityType: 'loan',
      entityId: id,
      details: { loan_id: existingLoan.loan_id, client_name: clientName, ...changes, __previous: previous },
    })
  }

  await supabase.rpc('update_client_stats', { p_client_id: existingLoan.client_id })

  return NextResponse.json(data, supabaseResponse)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  let body: { reason?: string } = {}
  try { body = await request.json() } catch { /* sin body */ }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  const { data: existingLoan, error: fetchError } = await supabase
    .from('loans')
    .select('id, loan_id, client_id, client:clients(name)')
    .eq('id', id)
    .single()

  if (fetchError || !existingLoan)
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

  const clientName = Array.isArray(existingLoan.client)
    ? existingLoan.client[0]?.name
    : (existingLoan.client as { name?: string } | null)?.name

  // Borrado lógico: el préstamo se archiva y desaparece de las listas,
  // pero conserva su historial, cuotas, pagos y documentos.
  const { error } = await supabase
    .from('loans')
    .update({ deleted_at: new Date().toISOString(), status: 'cancelled', cancelled_at: new Date().toISOString(), deleted_reason: reason || null })
    .eq('id', id)
    .is('deleted_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await logAuditEvent(supabase, {
      userId: user.id,
      action: 'loan.deleted',
      entityType: 'loan',
      entityId: id,
      details: { loan_id: existingLoan.loan_id, client_id: existingLoan.client_id, client_name: clientName, reason },
    })
  }

  await supabase.rpc('update_client_stats', { p_client_id: existingLoan.client_id })

  return NextResponse.json({ success: true }, supabaseResponse)
}
