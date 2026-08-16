import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import ClientsClient from './ClientsClient'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const supabase = await createServerSideClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('name')
    .limit(1000)

  const { data: loans } = await supabase
    .from('loans')
    .select('*')
    .is('deleted_at', null)
    .limit(1000)

  return (
    <MainLayout>
      <ClientsClient clients={clients || []} loans={loans || []} />
    </MainLayout>
  )
}
