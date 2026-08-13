import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf-8')
const url = 'https://snwwvvmszizarakrozah.supabase.co'
const srk = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
const OLD_EMAIL = 'yeysonmatos@gmail.com'
const NEW_EMAIL = 'gestordprestamos@gmail.com'

const supabase = createClient(url, srk)

const { data: users, error: err } = await supabase.auth.admin.listUsers()
if (err) { console.error('Err', err.message); process.exit(1) }

const admin = users.users.find(u => u.email === OLD_EMAIL)
if (!admin) { console.error('Admin no encontrado con', OLD_EMAIL); process.exit(1) }

// Si ya existe un usuario con el nuevo email, cambio de id de email choca — el admin debe quedar único
const conflict = users.users.find(u => u.email === NEW_EMAIL && u.id !== admin.id)
if (conflict) {
  console.error('Ya existe otro usuario con', NEW_EMAIL, '— id', conflict.id)
  process.exit(1)
}

const { data, error: updateErr } = await supabase.auth.admin.updateUserById(admin.id, { email: NEW_EMAIL, email_confirm: true })
if (updateErr) { console.error('Update error:', updateErr.message); process.exit(1) }
console.log('Email actualizado:', OLD_EMAIL, '→', data.user.email)
console.log('id:', data.user.id)