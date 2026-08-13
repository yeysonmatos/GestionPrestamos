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

const ADMIN = '2863f8a1-0890-4fbb-9f21-f335c5b0e78d'   // borra todo (incl. clientes)
const DEURISEN = 'f4bebbc7-2ed5-4a07-a8c4-13d9ed9d4130'  // borra todo menos clientes y sub

// Por user_id (email_messages usa recipient_user_id)
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

async function countFor(t, uid) {
  const col = t === 'email_messages' ? 'recipient_user_id' : 'user_id'
  const { count } = await admin.from(t).select('id', { count: 'exact', head: true }).eq(col, uid)
  return count
}

async function deleteFor(t, uid) {
  const col = t === 'email_messages' ? 'recipient_user_id' : 'user_id'
  const { error } = await admin.from(t).delete().eq(col, uid)
  if (error) throw new Error(`${t} DELETE: ${error.message}`)
}

async function main() {
  // 1) BACKUP ambas cuentas (completo)
  const backup = {}
  for (const t of TABLES) {
    const col = t === 'email_messages' ? 'recipient_user_id' : 'user_id'
    const { data, error } = await admin.from(t).select('*').in(col, [ADMIN, DEURISEN])
    if (error) throw new Error(`BACKUP ${t}: ${error.message}`)
    backup[t] = data || []
  }
  const dir = path.join('scripts', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const file = path.join(dir, `limpieza2-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), admin: ADMIN, deurisen: DEURISEN, data: backup }, null, 2))
  console.log(`BACKUP -> ${file}`)

  // 2) BORRADO por cuenta
  // ADMIN: todo borrable
  console.log(`\n=== DELETING ADMIN (${ADMIN.slice(0, 8)}) ===`)
  for (const t of TABLES.slice(0, 8)) { // sin subscriptions (admin no tiene)
    const c = await countFor(t, ADMIN)
    await deleteFor(t, ADMIN)
    console.log(`  ${t}: ${c}`)
  }
  // DEURISEN: todo menos clients y subscriptions
  console.log(`\n=== DELETING DEURISEN (${DEURISEN.slice(0, 8)}) — keeps clients + subscription ===`)
  for (const t of TABLES) {
    if (t === 'clients' || t === 'subscriptions') continue
    const c = await countFor(t, DEURISEN)
    await deleteFor(t, DEURISEN)
    console.log(`  ${t}: ${c}`)
  }

  // 3) RECALC stats de los clientes de Deurisen que se conservan
  const { data: deurisenClients } = await admin.from('clients').select('id').eq('user_id', DEURISEN)
  console.log(`\n=== RECALC ${(deurisenClients || []).length} clients (Deurisen) ===`)
  for (const cl of (deurisenClients || [])) {
    const { data, error } = await admin.rpc('update_client_stats', { p_client_id: cl.id })
    if (error) console.error(`  recalc ${cl.id.slice(0, 8)} ERR: ${error.message}`)
  }
  console.log('  recalc done')

  // 4) VERIFICACIÓN
  console.log('\n=== VERIFY ===')
  for (const [name, uid] of [['ADMIN', ADMIN], ['DEURISEN', DEURISEN]]) {
    console.log(`--- ${name} ---`)
    for (const t of TABLES) console.log(`  ${t}: ${await countFor(t, uid)}`)
  }
  const { data: subsDeu } = await admin.from('subscriptions').select('plan_id, status, ends_at').eq('user_id', DEURISEN)
  console.log('  Deurisen subs:', JSON.stringify(subsDeu))
  console.log('\nDone. Backup:', file)
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })