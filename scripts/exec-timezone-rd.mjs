// Ejecuta supabase/timezone-rd.sql
// (un solo reloj America/Santo_Domingo: today_rd() + funciones de mora re-creadas)
// y corre backfill de update_client_stats para refrescar estados.
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-timezone-rd.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

const sql = readFileSync('supabase/timezone-rd.sql', 'utf-8').trim()
const backfill = 'SELECT public.update_client_stats(id) FROM clients;'

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
console.log('✅ timezone-rd.sql aplicado.')

const fill = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: backfill }),
})
const fillText = await fill.text()
console.log('Backfill status:', fill.status)
console.log(fillText ? fillText : '(sin salida — OK)')
if (fill.ok) console.log('✅ Backfill completo (update_client_stats para todos los clientes).')
else process.exit(1)