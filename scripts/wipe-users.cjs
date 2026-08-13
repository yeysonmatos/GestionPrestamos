const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const raw = fs.readFileSync('.env.local', 'utf8')
function get(key) {
  const line = raw.split(/\r?\n/).find(l => l.trim().startsWith(key + '='))
  if (!line) return null
  return line.slice(key.length + 1).split(' #')[0].trim()
}
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const service = get('SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(url, service, { auth: { persistSession: false } })

const TARGETS = [
  'b9b34422-98f8-4d10-8486-814ee22bb1dd', // Yeyson Outlook
  'babfefb8-4d52-4488-9268-28b437cffd68', // Cliente Prueba
]

// orden de borrado respetando FKs (clientes/préstamos → cascada a cuotas/pagos/documentos)
const TABLES = [
  'payments',
  'documents',
  'clients',
  'loans',
  'settings',
  'audit_logs',
  'support_tickets',
  'email_messages',
  'subscriptions',
]

async function main() {
  const backup = {}
  const plan = []

  // 1) BACKUP
  for (const t of TABLES) {
    const col = t === 'email_messages' ? 'recipient_user_id' : 'user_id'
    const { data, error } = await admin.from(t).select('*').in(col, TARGETS)
    if (error) {
      console.error(`BACKUP ${t} FAILED: ${error.message}`)
      process.exit(1)
    }
    backup[t] = data || []
  }
  const dir = path.join('scripts', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const file = path.join(dir, `limpieza-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), targets: TARGETS, data: backup }, null, 2))
  console.log(`BACKUP -> ${file}`)
  for (const t of TABLES) console.log(`  ${t}: ${backup[t].length}`)

  // 2) BORRADO
  for (const t of TABLES) {
    const col = t === 'email_messages' ? 'recipient_user_id' : 'user_id'
    const { count } = await admin.from(t).select('id', { count: 'exact', head: true }).in(col, TARGETS)
    const { error } = await admin.from(t).delete().in(col, TARGETS)
    if (error) {
      console.error(`DELETE ${t} FAILED: ${error.message}`)
      process.exit(1)
    }
    plan.push([t, count])
    console.log(`DELETED ${t}: ${count}`)
  }

  // 3) REASIGNAR TRIAL NUEVO
  const { data: trialPlan } = await admin.from('plans').select('id').ilike('name', '%trial%').limit(1).maybeSingle()
  if (!trialPlan) {
    console.error('NO TRIAL PLAN FOUND')
    process.exit(1)
  }
  for (const uid of TARGETS) {
    const { error } = await admin.from('subscriptions').insert({
      user_id: uid,
      plan_id: trialPlan.id,
      status: 'trial',
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (error) {
      console.error(`TRIAL INSERT ${uid} FAILED: ${error.message}`)
      process.exit(1)
    }
    console.log(`TRIAL REASSIGNED user=${uid.slice(0, 8)} ends=+14d`)
  }

  // 4) VERIFICACIÓN
  console.log('\n=== VERIFY (expect 0) ===')
  for (const t of TABLES) {
    const col = t === 'email_messages' ? 'recipient_user_id' : 'user_id'
    const { count } = await admin.from(t).select('id', { count: 'exact', head: true }).in(col, TARGETS)
    console.log(`  ${t}: ${count}`)
  }
  const { data: subs } = await admin.from('subscriptions').select('user_id, plan_id, status, ends_at').in('user_id', TARGETS)
  console.log('\n=== NEW TRIALS ===')
  for (const s of (subs || [])) console.log(`  user=${s.user_id.slice(0, 8)} status=${s.status} ends=${s.ends_at}`)

  const before = { clients: 4, loans: 14, payments: 33, audit: 129, tickets: 10 }
  console.log('\nDone. Backup file:', file)
}
main()