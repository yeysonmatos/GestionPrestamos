// Repinta estado/mora de préstamos activos usando la misma lógica del cron diario
// (evalúa cuotas pending/partial/late vencidas; NO toca préstamos pagados/cancelados)
// Uso:  node scripts/repaint-loan-statuses.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { differenceInCalendarDays } from 'date-fns'

function readEnv(path) {
  const env = {}
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = readEnv('.env.local')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(url, key)

function computeLateStatus(dueDates) {
  const today = new Date()
  const maxLateDays = Math.max(0, ...dueDates.map(d => differenceInCalendarDays(today, new Date(d))))
  if (maxLateDays <= 0) return null
  const status = maxLateDays <= 30 ? 'late_1_30' : maxLateDays <= 60 ? 'late_31_60' : 'late_61_90'
  return { status, lateDays: maxLateDays }
}

const { data: loans, error } = await supabase
  .from('loans')
  .select('id')
  .in('status', ['active', 'late', 'late_1_30', 'late_31_60', 'late_61_90'])
  .is('deleted_at', null)

if (error) {
  console.error('Error leyendo préstamos:', error.message)
  process.exit(1)
}

console.log(`Evaluando ${loans.length} préstamos en curso...`)

let changed = 0
for (const loan of loans) {
  const { data: installments, error: iErr } = await supabase
    .from('installments')
    .select('due_date')
    .eq('loan_id', loan.id)
    .in('status', ['pending', 'partial', 'late'])

  if (iErr) {
    console.error(`  (installments ${loan.id}) ${iErr.message}`)
    continue
  }
  if (!installments || installments.length === 0) continue

  const late = computeLateStatus(installments.map(i => i.due_date))
  if (!late) continue

  const { error: uErr } = await supabase
    .from('loans')
    .update({ status: late.status, late_days: late.lateDays })
    .eq('id', loan.id)

  if (uErr) {
    console.error(`  (update ${loan.id}) ${uErr.message}`)
    continue
  }
  changed++
  console.log(`  ${loan.id} → ${late.status} (${late.lateDays}d)`)
}

console.log(`\n✅ ${changed} préstamo(s) repintado(s)`)