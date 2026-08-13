// Ejecuta supabase/email-notify.sql
// (tablas smtp_config + email_messages con RLS para el sistema de notificaciones)
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-email-notify.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

const sql = readFileSync('supabase/email-notify.sql', 'utf-8').trim()

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

if (res.ok) console.log('\n✅ email-notify.sql applied.')
else process.exit(1)