import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import LoansClientUnified from './LoansClientUnified'

export const dynamic = 'force-dynamic'

export default async function LoansPage({ searchParams }: { searchParams: Promise<{ deleted?: string; amount?: string }> }) {
  const sp = await searchParams
  const supabase = await createServerSideClient()

  const { data: loans } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: pendingInstallments } = await supabase
    .from('installments')
    .select('id, loan_id, due_date, number, loan:loans!inner(deleted_at)')
    .in('status', ['pending', 'partial', 'late'])
    .is('loan.deleted_at', null)
    .order('due_date', { ascending: true })
    .limit(100)

  return (
    <MainLayout>
      <LoansClientUnified
        loans={loans || []}
        pendingInstallments={pendingInstallments || []}
        deletedInfo={sp.deleted ? { loanId: sp.deleted, amount: sp.amount || '' } : null}
      />
    </MainLayout>
  )
}
