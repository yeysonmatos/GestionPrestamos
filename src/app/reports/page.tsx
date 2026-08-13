import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import ReportsContent from './ReportsContent'
import type { LoanStats } from '@/types'

export default async function ReportsPage(props: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await props.searchParams
  const supabase = await createServerSideClient()

  const { data: { user } } = await supabase.auth.getUser()
  const now = new Date()

  // Reportes avanzados: Trial (gratis) y Pro (pago con límite NULL) los habilitan.
  // Básico (pago con límite numérico) ve reportes básicos.
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan:plans(max_clients, price)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const subPlan = Array.isArray(sub?.plan) ? sub!.plan[0] : sub?.plan
  const planPrice = Number((subPlan as { price?: number } | undefined)?.price || 0)
  const planMaxClients = (subPlan as { max_clients?: number } | undefined)?.max_clients ?? null
  const advancedReports = sub ? (planPrice === 0 || planMaxClients === null) : true
  const effectivePeriod = advancedReports ? period : 'all'
  const effectiveFilterDate = effectivePeriod !== 'all' ? (effectivePeriod === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    : effectivePeriod === 'quarter'
    ? new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0]
    : effectivePeriod === 'year'
    ? new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
    : '2000-01-01') : undefined

  let loansQuery = supabase.from('loans').select('*, client:clients(*)').is('deleted_at', null)
  if (effectiveFilterDate) loansQuery = loansQuery.gte('created_at', effectiveFilterDate)
  const { data: loans } = await loansQuery.order('created_at', { ascending: false })

  let paymentsQuery = supabase.from('payments').select('*, loan:loans(client:clients(*))').eq('status', 'paid')
  if (effectiveFilterDate) paymentsQuery = paymentsQuery.gte('payment_date', effectiveFilterDate)
  const { data: payments } = await paymentsQuery.order('payment_date', { ascending: false })

  const { data: loanStats } = await supabase.rpc('get_loan_stats', {
    p_user_id: user?.id,
    p_from_date: effectiveFilterDate ?? null,
  })

  return (
    <MainLayout>
      <ReportsContent
        loans={loans || []}
        payments={payments || []}
        loanStats={loanStats as LoanStats | null}
        initialPeriod={effectivePeriod}
        advancedReports={advancedReports}
      />
    </MainLayout>
  )
}