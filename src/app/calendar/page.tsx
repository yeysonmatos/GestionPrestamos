import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import CalendarContent, { type OpenEndedLoan } from './CalendarContent'

export default async function CalendarPage() {
  const supabase = await createServerSideClient()
  const today = new Date().toISOString().split('T')[0]
  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const yearAgoStr = yearAgo.toISOString().split('T')[0]

  const { data: installments } = await supabase
    .from('installments')
    .select('*, loan:loans!inner(client:clients(*))')
    .gte('due_date', yearAgoStr)
    .is('loan.deleted_at', null)
    .order('due_date', { ascending: true })
    .limit(200)

  const { data: payments } = await supabase
    .from('payments')
    .select('*, loan:loans(client:clients(*))')
    .eq('status', 'paid')
    .gte('payment_date', yearAgoStr)
    .order('payment_date', { ascending: false })
    .limit(200)

  const { data: openEndedLoans } = await supabase
    .from('loans')
    .select('id, loan_id, amount, installment_amount, remaining_amount, payment_day, first_payment_date, client:clients(id, name, phone)')
    .eq('open_ended', true)
    .eq('status', 'active')
    .is('deleted_at', null)

  return (
    <MainLayout>
      <CalendarContent
        installments={installments || []}
        payments={payments || []}
        openEndedLoans={(openEndedLoans || []) as unknown as OpenEndedLoan[]}
      />
    </MainLayout>
  )
}
