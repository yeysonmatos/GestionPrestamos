import { notFound } from 'next/navigation'
import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import NewLoanForm from '@/app/loans/new/NewLoanForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditLoanPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSideClient()

  const { data: loan } = await supabase
    .from('loans')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!loan || (Number(loan.paid_installments) > 0 || Number(loan.paid_amount) > 0)) notFound()

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('status', 'active')
    .order('name')

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .single()

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">Editar préstamo</h1>
        <NewLoanForm clients={clients || []} settings={settings} initialData={loan} isEditing loanId={id} />
      </div>
    </MainLayout>
  )
}