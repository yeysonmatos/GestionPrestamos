import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import LoansClient from './LoansClient'

export default async function LoansPage() {
  const supabase = await createServerSideClient()

  const { data: loans } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .order('created_at', { ascending: false })

  return (
    <MainLayout>
      <LoansClient loans={loans || []} />
    </MainLayout>
  )
}
