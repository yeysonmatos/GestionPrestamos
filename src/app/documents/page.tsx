import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import DocumentsContent from './DocumentsContent'

export default async function DocumentsPage() {
  const supabase = await createServerSideClient()

  const { data: documents } = await supabase
    .from('documents')
    .select('*, client:clients(id, name)')
    .order('created_at', { ascending: false })

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  return (
    <MainLayout>
      <DocumentsContent documents={documents || []} clients={clients || []} />
    </MainLayout>
  )
}
