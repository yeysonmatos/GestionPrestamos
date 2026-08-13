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

const CONFIG_ID = '00000000-0000-0000-0000-00000000e601'
const appPassword = 'suzxbsqovkwuszre'

admin
  .from('smtp_config')
  .update({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    username: 'gestordprestamos@gmail.com',
    pass: appPassword,
    from_name: 'Gestor de Prestamos',
    from_email: 'gestordprestamos@gmail.com',
    enabled: true,
    updated_at: new Date().toISOString(),
  })
  .eq('id', CONFIG_ID)
  .then(({ data, error }) => {
    if (error) {
      console.error('UPDATE ERROR:', error.message)
      return
    }
    return admin.from('smtp_config').select('*').eq('id', CONFIG_ID).maybeSingle()
  })
  .then(({ data, error }) => {
    if (error) {
      console.error('READ ERROR:', error.message)
      return
    }
    if (!data) {
      console.log('NO CONFIG ROW')
      return
    }
    console.log(JSON.stringify({
      host: data.host,
      port: data.port,
      secure: data.secure,
      enabled: data.enabled,
      username: data.username,
      from_name: data.from_name,
      from_email: data.from_email,
      pass_stored: data.pass ? (data.pass.length + ' chars, has_spaces=' + /\s/.test(data.pass)) : null,
    }, null, 2))
  }, err => console.error('NO CLIENT', err))