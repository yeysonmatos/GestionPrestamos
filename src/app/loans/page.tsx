import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import LoansClientUnified from './LoansClientUnified'

export const dynamic = 'force-dynamic'

export default async function LoansPage() {
  const supabase = await createServerSideClient()

  const { data: loans } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .order('created_at', { ascending: false })

  const { data: pendingInstallments } = await supabase
    .from('installments')
    .select('id, loan_id, due_date, number')
    .in('status', ['pending', 'partial', 'late'])
    .order('due_date', { ascending: true })

  return (
    <MainLayout>
      <LoansClientUnified loans={loans || []} pendingInstallments={pendingInstallments || []} />
    </MainLayout>
  )
}
