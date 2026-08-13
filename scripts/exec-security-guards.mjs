import fs from 'fs'

// Uso: $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-security-guards.mjs
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

const sql = fs.readFileSync('supabase/security-guards.sql', 'utf8').trim()

const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + ACCESS_TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const text = await res.text()
console.log('Status:', res.status)
console.log(text || '(OK)')