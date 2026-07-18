import { createServerSideClient } from '@/lib/supabase-server'

export default async function DebugPage() {
  const supabase = await createServerSideClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <pre>No autenticado</pre>

  const { data: loans } = await supabase.from('loans').select('*, clients(name)').limit(50)
  const { data: loan53 } = await supabase.from('loans').select('*, clients(name)').eq('id', '53bb4808-0004-45ef-98cc-c9e53e481d95').maybeSingle()
  const { data: loanL100001 } = await supabase.from('loans').select('*, clients(name)').eq('loan_id', 'L-100001').maybeSingle()
  const { data: payments } = await supabase.from('payments').select('*').eq('loan_id', '53bb4808-0004-45ef-98cc-c9e53e481d95').order('created_at', { ascending: false })
  const { data: installments } = await supabase.from('installments').select('*').eq('loan_id', '53bb4808-0004-45ef-98cc-c9e53e481d95').order('number')

  return (
    <pre style={{ fontSize: 12 }}>
{JSON.stringify({ loans, loan53, loanL100001, payments, installments }, null, 2)}
    </pre>
  )
}
