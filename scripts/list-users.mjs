import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
const url = 'https://snwwvvmszizarakrozah.supabase.co'
const srk = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
const supabase = createClient(url, srk)

const { data, error } = await supabase.auth.admin.listUsers()
if (error) { console.error('Err', error.message); process.exit(1) }
console.log('== USUARIOS AUTH ==')
for (const u of data.users) {
  const { data: app } = await supabase.from('app_users').select('role,status,display_name').eq('id', u.id).maybeSingle()
  console.log(`- ${u.email}  (role=${app?.role}, status=${app?.status}, name=${app?.display_name})`)
}