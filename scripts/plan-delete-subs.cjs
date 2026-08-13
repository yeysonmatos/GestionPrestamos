const fs = require('fs')
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

async function main() {
  const [{ data: subs }, { data: payments }] = await Promise.all([
    admin.from('subscriptions').select('*'),
    admin.from('subscription_payments').select('*'),
  ])
  if (!subs) return console.error('no subs')

  // pagos por subscription_id
  const payBySub = new Map()
  for (const p of (payments || [])) {
    const list = payBySub.get(p.subscription_id) || []
    list.push(p)
    payBySub.set(p.subscription_id, list)
  }

  // subs por usuario ordenadas por created_at desc
  const byUser = new Map()
  for (const s of subs) {
    const list = byUser.get(s.user_id) || []
    list.push(s)
    byUser.set(s.user_id, list)
  }
  for (const [uid, list] of byUser) {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  console.log('=== LATEST SUB PER USER ===')
  for (const [uid, list] of byUser) {
    const latest = list[0]
    console.log(`user=${uid} | KEEP id=${latest.id} plan=${latest.plan_id} status=${latest.status} ends=${latest.ends_at} payments=${(payBySub.get(latest.id) || []).length}`)
  }

  console.log('\n=== OLD SUBS (candidates to delete) ===')
  let totalToDelete = 0
  for (const [uid, list] of byUser) {
    for (const s of list.slice(1)) {
      const payCount = (payBySub.get(s.id) || []).length
      totalToDelete++
      console.log(`user=${uid} | DELETE id=${s.id} plan=${s.plan_id} status=${s.status} ends=${s.ends_at} payments=${payCount}`)
    }
  }
  console.log(`\nTOTAL to delete: ${totalToDelete}`)
}
main()