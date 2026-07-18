import { createServerSideClient } from '@/lib/supabase-server'

export default async function DebugPage() {
  const supabase = await createServerSideClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <pre>No autenticado</pre>

  const { data: loans } = await supabase.from('loans').select('*, clients(name)').limit(10)
  const { data: payments } = await supabase.from('payments').select('*').limit(20).order('created_at', { ascending: false })
  const { data: installments } = await supabase.from('installments').select('*').limit(20).order('number')

  return (
    <pre style={{ fontSize: 12 }}>
{JSON.stringify({ loans, payments, installments }, null, 2)}
    </pre>
  )
}
