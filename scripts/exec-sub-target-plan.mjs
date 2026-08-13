// Ejecuta supabase/sub-payment-target-plan.sql (agrega target_plan_id a subscription_payments)
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-sub-target-plan.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

const sql = readFileSync('supabase/sub-payment-target-plan.sql', 'utf-8').trim()

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

const text = await res.text()
console.log('Status:', res.status)
console.log(text ? text : '(sin salida — OK)')

if (res.ok) console.log('\n✅ subscription_payments.target_plan_id SQL applied.')
else process.exit(1)