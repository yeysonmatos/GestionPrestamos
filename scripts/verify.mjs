import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const anonKey = readFileSync('.env.local', 'utf-8')
  .match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim()

const supabase = createClient('https://snwwvvmszizarakrozah.supabase.co', anonKey)

async function check() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'yeysonmatos@outlook.com', password: 'admin123'
  })
  if (error) { console.error('Auth error:', error.message); return }

  // Get ALL loans for this user
  const { data: loans } = await supabase.from('loans').select('loan_id, amount, total_amount, remaining_amount, paid_amount, installment_amount, amortization_type, status, progress, paid_installments, installments').order('created_at', { ascending: false })

  console.log('LOANS:')
  loans?.forEach(l => {
    console.log(`\n${l.loan_id} (${l.amortization_type})`)
    console.log(`  amount=${l.amount} total_amount=${l.total_amount} remaining=${l.remaining_amount} paid=${l.paid_amount}`)
    console.log(`  installment_amount=${l.installment_amount} installments=${l.installments} paid_inst=${l.paid_installments} progress=${l.progress} status=${l.status}`)
  })

  // Get the most recent interest-only loan that's NOT liquidated
  const target = loans?.find(l => l.amortization_type === 'interest_only' && l.amount === 25000 && l.status === 'active')
  if (!target) { console.log('\nNo target interest-only loan found'); return }

  console.log(`\n=== DETAILS FOR ${target.loan_id} ===`)
  
  const { data: insts } = await supabase.from('installments').select('*').eq('loan_id', target.id).order('number')
  console.log('\nInstallments:')
  insts?.forEach(i => console.log(`  #${i.number}: amount=${i.amount} capital=${i.capital} interest=${i.interest} balance=${i.balance} status=${i.status} paid_amount=${i.paid_amount}`))

  const { data: pays } = await supabase.from('payments').select('*').eq('loan_id', target.id).order('created_at')
  console.log('\nPayments:')
  pays?.forEach(p => console.log(`  type=${p.type} amount=${p.amount} capital=${p.capital_amount} interest=${p.interest_amount} status=${p.status} installment_id=${p.installment_id ? 'yes' : 'no'}`))
}

check()
