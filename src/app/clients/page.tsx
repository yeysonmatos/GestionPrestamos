import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import ClientsClient from './ClientsClient'

export default async function ClientsPage() {
  const supabase = await createServerSideClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  const { data: loans } = await supabase
    .from('loans')
    .select('*')

  return (
    <MainLayout>
      <ClientsClient clients={clients || []} loans={loans || []} />
    </MainLayout>
  )
}
