import { notFound } from 'next/navigation'
import { createServerSideClient } from '@/lib/supabase-server'
import NavHeader from '@/components/NavHeader'
import PersonDetail from './PersonDetail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PersonPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSideClient()

  const { data: person } = await supabase
    .from('people')
    .select('*')
    .eq('id', id)
    .single()

  if (!person) notFound()

  const { data: loans } = await supabase
    .from('loans')
    .select('*, person:people(*)')
    .eq('person_id', id)
    .order('created_at', { ascending: false })

  return (
    <>
      <NavHeader />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <PersonDetail person={person} loans={loans || []} />
      </main>
    </>
  )
}
