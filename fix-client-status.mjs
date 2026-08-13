import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function fixClientStatuses() {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id')
  
  if (error) {
    console.error('Error fetching clients:', error)
    return
  }

  console.log(`Found ${clients.length} clients, updating stats...`)
  
  let updated = 0
  for (const client of clients) {
    const { error: rpcError } = await supabase.rpc('update_client_stats', { p_client_id: client.id })
    if (rpcError) {
      console.error(`Error updating ${client.id}:`, rpcError)
    } else {
      updated++
    }
  }
  
  console.log(`Updated ${updated}/${clients.length} clients`)
}

fixClientStatuses()