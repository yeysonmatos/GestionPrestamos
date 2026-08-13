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
  const { data: subs } = await admin.from('subscriptions').select('id, user_id, created_at')
  if (!subs) return console.error('no subs')

  const byUser = new Map()
  for (const s of subs) {
    const list = byUser.get(s.user_id) || []
    list.push(s)
    byUser.set(s.user_id, list)
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  let reassigned = 0
  let deleted = 0

  for (const [uid, list] of byUser) {
    const keep = list[0]
    const oldIds = list.slice(1).map(s => s.id)

    if (oldIds.length) {
      // 1) Reasignar pagos de subs viejas → sub actual (conserva el historial de ingresos)
      const { error: payErr } = await admin
        .from('subscription_payments')
        .update({ subscription_id: keep.id })
        .in('subscription_id', oldIds)
      if (payErr) {
        console.error(`REASSIGN ERR user=${uid}:`, payErr.message)
        continue
      }
      reassigned += oldIds.length

      // 2) Borrar subs viejas
      const { error: delErr } = await admin.from('subscriptions').delete().in('id', oldIds)
      if (delErr) {
        console.error(`DELETE ERR user=${uid}:`, delErr.message)
        continue
      }
      deleted += oldIds.length
      console.log(`user=${uid} -> keep ${keep.id}, deleted ${oldIds.length}`)
    }
  }

  console.log(`\nDONE. reassigned=${reassigned} old subs, deleted=${deleted}`)

  // Verificación
  const { data: remaining } = await admin.from('subscriptions').select('user_id')
  const { data: payCount } = await admin.from('subscription_payments').select('id')
  console.log(`Subscriptions remaining: ${(remaining || []).length} | Payments remaining: ${(payCount || []).length}`)
}
main()