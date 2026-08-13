import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import CollectionsContent from './CollectionsContent'

export default async function CollectionsPage() {
  const supabase = await createServerSideClient()
  const today = new Date().toISOString().split('T')[0]

  const pendingStatuses = ['pending', 'partial', 'late']

  const { data: todayInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans!inner(*, client:clients(*))')
    .eq('due_date', today)
    .in('status', pendingStatuses)
    .is('loan.deleted_at', null)
    .order('due_date')
    .limit(50)

  const { data: overdueInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans!inner(*, client:clients(*))')
    .in('status', pendingStatuses)
    .lt('due_date', today)
    .is('loan.deleted_at', null)
    .order('due_date')
    .limit(50)

  const { data: upcomingInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans!inner(*, client:clients(*))')
    .in('status', pendingStatuses)
    .gt('due_date', today)
    .is('loan.deleted_at', null)
    .order('due_date')
    .limit(20)

  const { data: recentPayments } = await supabase
    .from('payments')
    .select('*, loan:loans(*, client:clients(*))')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: openEndedLoans } = await supabase
    .from('loans')
    .select('id, loan_id, amount, installment_amount, remaining_amount, payment_day, first_payment_date, client:clients(id, name, phone)')
    .eq('open_ended', true)
    .eq('status', 'active')
    .is('deleted_at', null) as { data: { id: string; loan_id: string; amount: number; installment_amount: number; remaining_amount: number; payment_day: number; first_payment_date: string; client: { id: string; name: string; phone: string | null } | null }[] | null }

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .single()

  const { data: activeLoansRaw } = await supabase
    .from('loans')
    .select('id, loan_id, amount, remaining_amount, installment_amount, amortization_type, open_ended, client:clients(id, name, phone, whatsapp)')
    .in('status', ['active', 'late'])
    .is('deleted_at', null)
    .order('loan_id')

  type ActiveLoanRaw = { id: string; loan_id: string; amount: number; remaining_amount: number; installment_amount: number; amortization_type: string; open_ended: boolean; client: { id: string; name: string; phone: string | null; whatsapp: string | null } | { id: string; name: string; phone: string | null; whatsapp: string | null }[] | null }
  const activeLoans: { id: string; loan_id: string; amount: number; remaining_amount: number; installment_amount: number; amortization_type: string; open_ended: boolean; client: { id: string; name: string; phone: string | null; whatsapp: string | null } | null }[] = (activeLoansRaw || []).map((r: ActiveLoanRaw) => ({
    ...r,
    client: Array.isArray(r.client) ? r.client[0] || null : r.client || null,
  }))

  return (
    <MainLayout>
      <CollectionsContent
        todayInstallments={todayInstallments || []}
        overdueInstallments={overdueInstallments || []}
        upcomingInstallments={upcomingInstallments || []}
        recentPayments={recentPayments || []}
        openEndedLoans={openEndedLoans || []}
        settings={settings}
        activeLoans={activeLoans || []}
      />
    </MainLayout>
  )
}
