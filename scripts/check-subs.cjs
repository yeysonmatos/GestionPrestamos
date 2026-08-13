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
  const [{ data: subs, error: subErr }, { data: users }, { data: plans }] = await Promise.all([
    admin.from('subscriptions').select('*'),
    admin.from('app_users').select('*'),
    admin.from('plans').select('*'),
  ])
  if (subErr) return console.error('SUBS ERR', subErr.message)

  const planMap = new Map((plans || []).map(p => [p.id, p.name]))
  const userMap = new Map((users || []).map(u => [u.id, `${u.display_name || '?'} (${u.email || 'no-email'})`]))

  console.log('=== SUBSCRIPTIONS (all) ===')
  for (const s of (subs || [])) {
    console.log(`${userMap.get(s.user_id) || s.user_id} | plan=${planMap.get(s.plan_id) || s.plan_id} | status=${s.status} | starts=${s.starts_at || '—'} | ends=${s.ends_at || '—'} | id=${s.id}`)
  }

  console.log('\n=== PER USER COUNT ===')
  const count = {}
  for (const s of (subs || [])) count[s.user_id] = (count[s.user_id] || 0) + 1
  for (const [uid, c] of Object.entries(count)) console.log(`${userMap.get(uid) || uid}: ${c} subs`)
}
main()