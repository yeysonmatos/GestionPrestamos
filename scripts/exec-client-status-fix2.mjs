// Ejecuta supabase/client-status-fix2.sql
// (update_client_stats COMPLETO: status + métricas + trust, con guarda service_role)
// y corre el backfill para refrescar todos los clientes.
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-client-status-fix2.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

const sql = readFileSync('supabase/client-status-fix2.sql', 'utf-8').trim()
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
console.log('✅ client-status-fix2.sql aplicado.')

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