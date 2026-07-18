import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import CollectionsContent from './CollectionsContent'

export default async function CollectionsPage() {
  const supabase = await createServerSideClient()
  const today = new Date().toISOString().split('T')[0]

  const pendingStatuses = ['pending', 'partial']

  const { data: todayInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .eq('due_date', today)
    .in('status', pendingStatuses)
    .order('due_date')

  const { data: overdueInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .in('status', pendingStatuses)
    .lt('due_date', today)
    .order('due_date')

  const { data: upcomingInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .in('status', pendingStatuses)
    .gt('due_date', today)
    .order('due_date')
    .limit(20)

  const { data: recentPayments } = await supabase
    .from('payments')
    .select('*, loan:loans(client:clients(*))')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: openEndedLoans } = await supabase
    .from('loans')
    .select('id, loan_id, amount, installment_amount, remaining_amount, payment_day, first_payment_date, client:clients(id, name, phone)')
    .eq('open_ended', true)
    .eq('status', 'active') as { data: { id: string; loan_id: string; amount: number; installment_amount: number; remaining_amount: number; payment_day: number; first_payment_date: string; client: { id: string; name: string; phone: string | null } | null }[] | null }

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .single()

  return (
    <MainLayout>
      <CollectionsContent
        todayInstallments={todayInstallments || []}
        overdueInstallments={overdueInstallments || []}
        upcomingInstallments={upcomingInstallments || []}
        recentPayments={recentPayments || []}
        openEndedLoans={openEndedLoans || []}
        settings={settings}
      />
    </MainLayout>
  )
}
