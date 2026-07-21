import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import DashboardContent from './DashboardContent'
import { updateAllLoanLateStatuses } from '@/lib/loan-status'

export default async function DashboardPage() {
  const supabase = await createServerSideClient()
  await updateAllLoanLateStatuses(supabase)

  const { data: loans } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .order('created_at', { ascending: false })

  const today = new Date().toISOString().split('T')[0]

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0]

  const { data: chartPayments } = await supabase
    .from('payments')
    .select('amount, payment_date')
    .eq('status', 'paid')
    .gte('payment_date', sixMonthsAgoStr)
    .order('payment_date', { ascending: false })

  const { data: clients } = await supabase
    .from('clients')
    .select('*')

  const { data: todayPayments } = await supabase
    .from('payments')
    .select('amount, payment_date')
    .eq('payment_date', today)
    .eq('status', 'paid')

  const { data: overdueInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .in('status', ['pending', 'partial'])
    .lt('due_date', today)

  const { data: upcomingInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .in('status', ['pending', 'partial'])
    .gte('due_date', today)
    .lte('due_date', today)
    .order('due_date', { ascending: true })
    .limit(10)

  return (
    <MainLayout>
      <DashboardContent
        loans={loans || []}
        chartPayments={chartPayments || []}
        clients={clients || []}
        todayPayments={todayPayments || []}
        overdueInstallments={overdueInstallments || []}
        upcomingInstallments={upcomingInstallments || []}
      />
    </MainLayout>
  )
}
