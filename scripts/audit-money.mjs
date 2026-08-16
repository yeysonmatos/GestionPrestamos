import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const envPath = path.join(import.meta.dirname, '..', '.env.local')
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const r1 = await supabase.from('app_users').select('*')
console.log('app_users err:', JSON.stringify(r1.error), 'rows:', r1.data?.length)

const r2 = await supabase.from('settings').select('*')
console.log('settings err:', JSON.stringify(r2.error), 'rows:', r2.data?.length)
if (r2.data?.length) console.log('  sample:', JSON.stringify(r2.data[0]).slice(0, 300))

const r3 = await supabase.from('clients').select('*').limit(1)
console.log('client keys:', Object.keys(r3.data?.[0] || {}).join(', '))

const r4 = await supabase.from('loans').select('*').limit(1)
console.log('loans err:', JSON.stringify(r4.error), 'len:', r4.data?.length)