import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import ClientsClient from './ClientsClient'
import { getUserSubscription, isExpiredForReadOnly } from '@/lib/subscription-guard'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const supabase = await createServerSideClient()

  const { data: { user } } = await supabase.auth.getUser()
  const subSnap = await getUserSubscription(supabase, user?.id || '')
  const readOnly = isExpiredForReadOnly(subSnap)

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
      <ClientsClient clients={clients || []} loans={loans || []} readOnly={readOnly} />
    </MainLayout>
  )
}
