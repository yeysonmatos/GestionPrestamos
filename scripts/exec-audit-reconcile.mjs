// Ejecuta supabase/audit-reconcile.sql y luego invoca reconcile_money()
// para verificar invariantes contables en la BD.
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-audit-reconcile.mjs
//       node scripts/exec-audit-reconcile.mjs <user_uuid>   (validar una cuenta)
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'
const USER_ID = process.argv[2] || null

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

const ddl = readFileSync('supabase/audit-reconcile.sql', 'utf-8').trim()

const ddlRes = await query(ddl)
console.log('DDL status:', ddlRes.status)
console.log(ddlRes.text ? ddlRes.text : '(sin salida — OK)')
if (!ddlRes.ok) process.exit(1)

const call = `SELECT public.reconcile_money(${USER_ID ? `'${USER_ID}'::uuid` : 'NULL'});`
const runRes = await query(call)
console.log('\nRUN status:', runRes.status)
if (!runRes.ok) {
  console.log(runRes.text)
  process.exit(1)
}

// La respuesta viene como [ { reconcile_money: "jsonb text" } ]
try {
  const parsed = JSON.parse(runRes.text)
  const payload = parsed?.[0]?.reconcile_money
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload
  console.log('\n===== RECONCILIACIÓN =====')
  console.log('Préstamos verificables :', data.testable_loans)
  console.log('  · open-ended omitidos :', data.open_ended_skipped)
  console.log('Filas de pago revisadas:', data.payment_rows)
  console.log('Clientes balance OK     :', data.clients_checked)
  console.log('Errores encontrados     :', data.error_count)
  if (data.error_count > 0) {
    console.log('\nDetalle de errores:')
    for (const e of data.errors) console.log('  -', JSON.stringify(e))
  } else {
    console.log('\n✅ Todo consistente.')
  }
} catch (err) {
  console.log('(no se pudo interpretar JSON de la BD)')
  console.log(runRes.text)
}