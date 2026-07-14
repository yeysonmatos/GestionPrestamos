import { createServerSideClient } from '@/lib/supabase-server'
import NavHeader from '@/components/NavHeader'
import PeopleClient from './PeopleClient'

export default async function PeoplePage() {
  const supabase = await createServerSideClient()

  const { data: people } = await supabase
    .from('people')
    .select('*')
    .order('name')

  const { data: loans } = await supabase
    .from('loans')
    .select('*')

  return (
    <>
      <NavHeader />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <PeopleClient people={people || []} loans={loans || []} />
      </main>
    </>
  )
}
