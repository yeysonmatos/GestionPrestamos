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

admin.from('smtp_config').select('*').limit(1).then(({ data, error }) => {
  if (error) {
    console.error('ERROR:', error.message)
    return
  }
  if (!data || !data.length) {
    console.log('NO CONFIG FOUND')
    return
  }
  const c = data[0]
  console.log(JSON.stringify({
    host: c.host,
    port: c.port,
    secure: c.secure,
    enabled: c.enabled,
    username: c.username,
    pass_stored: c.pass ? (c.pass.length + ' chars') : null,
    pass_preview: c.pass ? c.pass.slice(0, 4) + '...' + c.pass.slice(-4) : null,
    pass_has_spaces: c.pass ? /\s/.test(c.pass) : null,
    from_name: c.from_name,
    from_email: c.from_email,
  }, null, 2))
}, err => console.error('NO CLIENT', err))