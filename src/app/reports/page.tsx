import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import ReportsContent from './ReportsContent'

export default async function ReportsPage() {
  const supabase = await createServerSideClient()

  const { data: loans } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .order('created_at', { ascending: false })

  const { data: payments } = await supabase
    .from('payments')
    .select('*, loan:loans(client:clients(*))')
    .eq('status', 'paid')
    .order('payment_date', { ascending: false })

  const { data: clients } = await supabase
    .from('clients')
    .select('*')

  return (
    <MainLayout>
      <ReportsContent loans={loans || []} payments={payments || []} clients={clients || []} />
    </MainLayout>
  )
}
