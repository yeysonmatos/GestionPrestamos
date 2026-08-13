// Ejecuta supabase/delete-loan-reason.sql
// (columna loans.deleted_reason para persistir el motivo de eliminación)
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-delete-loan-reason.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

const sql = readFileSync('supabase/delete-loan-reason.sql', 'utf-8').trim()

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

if (res.ok) console.log('\n✅ delete-loan-reason.sql applied.')
else process.exit(1)