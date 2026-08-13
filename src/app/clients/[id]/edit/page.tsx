import { notFound } from 'next/navigation'
import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import ClientForm from '@/app/clients/new/ClientForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditClientPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSideClient()

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">Editar cliente</h1>
        <ClientForm initialData={client} isEditing clientId={id} />
      </div>
    </MainLayout>
  )
}