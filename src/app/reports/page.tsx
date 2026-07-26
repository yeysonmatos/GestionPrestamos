import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import ReportsContent from './ReportsContent'

export default async function ReportsPage(props: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await props.searchParams
  const supabase = await createServerSideClient()

  const now = new Date()
  const periodStart = period === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    : period === 'quarter'
    ? new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0]
    : period === 'year'
    ? new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
    : '2000-01-01'

  const filterDate = period && period !== 'all' ? periodStart : undefined

  let loansQuery = supabase.from('loans').select('*, client:clients(*)')
  if (filterDate) loansQuery = loansQuery.gte('created_at', filterDate)
  const { data: loans } = await loansQuery.order('created_at', { ascending: false })

  let paymentsQuery = supabase.from('payments').select('*, loan:loans(client:clients(*))').eq('status', 'paid')
  if (filterDate) paymentsQuery = paymentsQuery.gte('payment_date', filterDate)
  const { data: payments } = await paymentsQuery.order('payment_date', { ascending: false })

  const { data: clients } = await supabase.from('clients').select('*')

  return (
    <MainLayout>
      <ReportsContent
        loans={loans || []}
        payments={payments || []}
        clients={clients || []}
        initialPeriod={period || 'all'}
      />
    </MainLayout>
  )
}
