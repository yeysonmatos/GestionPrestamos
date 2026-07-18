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
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  const { data: payments } = await supabase
    .from('payments')
    .select('*, loan:loans(client:clients(*))')
    .eq('status', 'paid')
    .gte('payment_date', thirtyDaysAgoStr)
    .order('payment_date', { ascending: false })

  const { data: clients } = await supabase
    .from('clients')
    .select('*')

  const { data: todayPayments } = await supabase
    .from('payments')
    .select('*, loan:loans(client:clients(*))')
    .eq('payment_date', today)
    .eq('status', 'paid')

  const { data: overdueInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .in('status', ['pending', 'partial'])
    .lt('due_date', today)

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const { data: upcomingInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans(client:clients(*))')
    .in('status', ['pending', 'partial'])
    .gte('due_date', today)
    .lte('due_date', tomorrowStr)
    .order('due_date', { ascending: true })

  return (
    <MainLayout>
      <DashboardContent
        loans={loans || []}
        payments={payments || []}
        clients={clients || []}
        todayPayments={todayPayments || []}
        overdueInstallments={overdueInstallments || []}
        upcomingInstallments={upcomingInstallments || []}
      />
    </MainLayout>
  )
}
