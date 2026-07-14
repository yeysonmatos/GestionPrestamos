import { notFound } from 'next/navigation'
import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import ClientProfile from './ClientProfile'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientProfilePage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSideClient()

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  const { data: loans } = await supabase
    .from('loans')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  return (
    <MainLayout>
      <ClientProfile client={client} loans={loans || []} payments={payments || []} documents={documents || []} />
    </MainLayout>
  )
}
