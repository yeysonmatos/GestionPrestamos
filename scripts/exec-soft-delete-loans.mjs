// Ejecuta supabase/soft-delete-loans.sql
// (borrado lógico: loans.deleted_at + update_client_stats sin préstamos archivados)
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-soft-delete-loans.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

const sql = readFileSync('supabase/soft-delete-loans.sql', 'utf-8').trim()

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

if (res.ok) console.log('\n✅ soft-delete-loans SQL applied.')
else process.exit(1)