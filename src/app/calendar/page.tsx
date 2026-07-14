import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import CalendarContent from './CalendarContent'

export default async function CalendarPage() {
  const supabase = await createServerSideClient()

  const { data: installments } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .order('due_date', { ascending: true })

  const { data: payments } = await supabase
    .from('payments')
    .select('*, loan:loans(client:clients(*))')
    .eq('status', 'paid')
    .order('payment_date', { ascending: false })

  const { data: openEndedLoans } = await supabase
    .from('loans')
    .select('id, loan_id, amount, installment_amount, remaining_amount, payment_day, first_payment_date, client:clients(id, name, phone)')
    .eq('open_ended', true)
    .eq('status', 'active')

  return (
    <MainLayout>
      <CalendarContent
        installments={installments || []}
        payments={payments || []}
        openEndedLoans={openEndedLoans || []}
      />
    </MainLayout>
  )
}
