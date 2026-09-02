// Ejecuta supabase/trial-14-days.sql (trial de 14 días).
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-trial-14-days.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

const sql = readFileSync('supabase/trial-14-days.sql', 'utf-8').trim()

const apply = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})
const applyText = await apply.text()
console.log('Apply status:', apply.status)
console.log(applyText ? applyText : '(sin salida — OK)')
if (!apply.ok) process.exit(1)
console.log('✅ trial-14-days.sql aplicado.')