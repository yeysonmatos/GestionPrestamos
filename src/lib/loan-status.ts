import type { SupabaseClient } from '@supabase/supabase-js'
import { differenceInCalendarDays } from 'date-fns'

export function computeLateStatus(dueDates: (string | Date)[]): { status: string; lateDays: number } | null {
  const today = new Date()
  const maxLateDays = Math.max(0, ...(dueDates || []).map(d => differenceInCalendarDays(today, new Date(d))))
  if (maxLateDays <= 0) return null
  const status = maxLateDays <= 30 ? 'late_1_30' : maxLateDays <= 60 ? 'late_31_60' : 'late_61_90'
  return { status, lateDays: maxLateDays }
}

export async function updateAllLoanLateStatuses(supabase: SupabaseClient): Promise<void> {
  const { data: loans } = await supabase
    .from('loans')
    .select('id')
    .in('status', ['active', 'late', 'late_1_30', 'late_31_60', 'late_61_90'])
    .is('deleted_at', null)

  if (!loans || loans.length === 0) return

  for (const loan of loans) {
    const { data: installments } = await supabase
      .from('installments')
      .select('due_date')
      .eq('loan_id', loan.id)
      .in('status', ['pending', 'partial', 'late'])

    if (!installments || installments.length === 0) continue

    const late = computeLateStatus(installments.map(i => i.due_date))
    if (!late) continue

    await supabase.from('loans').update({
      status: late.status,
      late_days: late.lateDays,
    }).eq('id', loan.id)
  }
}
