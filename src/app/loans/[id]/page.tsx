import { notFound } from 'next/navigation'
import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import LoanDetail from './LoanDetail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LoanDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSideClient()

  const { data: loan } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .eq('id', id)
    .single()

  if (!loan) notFound()

  const { data: installments } = await supabase
    .from('installments')
    .select('*')
    .eq('loan_id', id)
    .order('number', { ascending: true })

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('loan_id', id)
    .order('created_at', { ascending: false })

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .single()

  return (
    <MainLayout>
      <LoanDetail loan={loan} installments={installments || []} payments={payments || []} settings={settings} />
    </MainLayout>
  )
}
