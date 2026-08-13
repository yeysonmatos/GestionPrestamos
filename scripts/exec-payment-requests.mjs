import fs from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

const sql = fs.readFileSync('supabase/payment-requests.sql', 'utf8').trim()

const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + ACCESS_TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const text = await res.text()
console.log('Status:', res.status)
console.log(text || '(OK)')