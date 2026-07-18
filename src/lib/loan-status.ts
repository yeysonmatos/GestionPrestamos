import type { SupabaseClient } from '@supabase/supabase-js'
import { differenceInCalendarDays } from 'date-fns'

export async function updateAllLoanLateStatuses(supabase: SupabaseClient): Promise<void> {
  const { data: loans } = await supabase
    .from('loans')
    .select('id')
    .in('status', ['active', 'late', 'late_1_30', 'late_31_60', 'late_61_90'])

  if (!loans || loans.length === 0) return

  for (const loan of loans) {
    const { data: installments } = await supabase
      .from('installments')
      .select('due_date')
      .eq('loan_id', loan.id)
      .in('status', ['pending', 'partial'])

    if (!installments || installments.length === 0) continue

    const today = new Date()
    const maxLateDays = Math.max(
      0,
      ...installments.map(i => differenceInCalendarDays(today, new Date(i.due_date)))
    )

    if (maxLateDays <= 0) continue

    let newStatus: string
    if (maxLateDays <= 30) newStatus = 'late_1_30'
    else if (maxLateDays <= 60) newStatus = 'late_31_60'
    else newStatus = 'late_61_90'

    await supabase.from('loans').update({
      status: newStatus,
      late_days: maxLateDays,
    }).eq('id', loan.id)
  }
}
