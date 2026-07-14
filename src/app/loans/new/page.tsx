import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import NewLoanForm from './NewLoanForm'

interface Props {
  searchParams: Promise<{ client_id?: string }>
}

export default async function NewLoanPage({ searchParams }: Props) {
  const { client_id } = await searchParams
  const supabase = await createServerSideClient()

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
        <h1 className="text-2xl font-bold text-foreground mb-6">Nuevo préstamo</h1>
        <NewLoanForm clients={clients || []} settings={settings} selectedClientId={client_id} />
      </div>
    </MainLayout>
  )
}
