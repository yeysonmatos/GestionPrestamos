// Seed script — usa sesión existente de yeysonmatos@outlook.com
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const anonKey = readFileSync('.env.local', 'utf-8')
  .match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim()

const supabase = createClient('https://snwwvvmszizarakrozah.supabase.co', anonKey)

async function seed() {
  // Sign in
  const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
    email: 'yeysonmatos@outlook.com',
    password: 'admin123',
  })
  if (loginError) { console.error('Login error:', loginError.message); return }
  const USER_ID = session.user.id
  console.log('Autenticado como:', USER_ID)

  // Clean existing data for this user
  for (const table of ['payments', 'installments', 'loans', 'clients']) {
    const { error } = await supabase.from(table).delete().eq('user_id', USER_ID)
    if (error) console.error(`Error deleting ${table}:`, error.message)
  }

  // Settings
  await supabase.from('settings').upsert({
    user_id: USER_ID, business_name: 'Financiera Demo', business_phone: '809-555-0000',
    currency: 'DOP', late_interest_rate: 0.5, loan_id_prefix: 'L-', grace_days: 0,
    default_frequency: 'monthly', default_installments: 6,
  }, { onConflict: 'user_id' })

  // Clients
  const { data: juan } = await supabase.from('clients').insert({
    user_id: USER_ID, name: 'Juan Pérez', first_name: 'Juan', last_name: 'Pérez',
    phone: '809-555-0101', document: '001-1234567-8', email: 'juan@email.com',
    provincia: 'Santo Domingo', municipio: 'Distrito Nacional', sector: 'Ensanche Quisqueya',
  }).select('id').single()

  const { data: maria } = await supabase.from('clients').insert({
    user_id: USER_ID, name: 'María García', first_name: 'María', last_name: 'García',
    phone: '809-555-0102', document: '001-2345678-9', email: 'maria@email.com',
    provincia: 'Santo Domingo', municipio: 'Santo Domingo Este', sector: 'Los Mina',
  }).select('id').single()

  if (!juan || !maria) { console.error('Failed to create clients'); return }
  console.log('Clientes creados:', juan.id, maria.id)

  // French loan with installments
  const { data: frenchLoan } = await supabase.from('loans').insert({
    loan_id: 'L-FR-001', user_id: USER_ID, client_id: juan.id,
    amount: 50000, interest_type: 'percentage', interest_rate: 4,
    total_amount: 57228.57, total_interest: 7228.57, installment_amount: 9538.10, installments: 6,
    frequency: 'monthly', start_date: '2026-04-01', first_payment_date: '2026-05-01', end_date: '2026-10-01',
    amortization_type: 'french', open_ended: false, status: 'active', late_interest_rate: 0.5,
  }).select('id').single()

  console.log('Préstamo francés:', frenchLoan.id)

  await supabase.from('installments').insert([
    { loan_id: frenchLoan.id, client_id: juan.id, number: 1, amount: 9538.10, capital: 7538.10, interest: 2000.00, balance: 42461.90, due_date: '2026-05-01', status: 'paid', paid_amount: 9522.81, paid_at: '2026-05-02', late_days: 1, late_amount: 47.61 },
    { loan_id: frenchLoan.id, client_id: juan.id, number: 2, amount: 9538.10, capital: 7839.63, interest: 1698.47, balance: 34622.27, due_date: '2026-06-01', status: 'pending' },
    { loan_id: frenchLoan.id, client_id: juan.id, number: 3, amount: 9538.10, capital: 8153.18, interest: 1384.92, balance: 26469.09, due_date: '2026-07-01', status: 'late', late_days: 19, late_amount: 953.81 },
    { loan_id: frenchLoan.id, client_id: juan.id, number: 4, amount: 9538.10, capital: 8479.31, interest: 1058.79, balance: 17989.78, due_date: '2026-08-01', status: 'pending' },
    { loan_id: frenchLoan.id, client_id: juan.id, number: 5, amount: 9538.10, capital: 8818.51, interest: 719.59, balance: 9171.27, due_date: '2026-09-01', status: 'pending' },
    { loan_id: frenchLoan.id, client_id: juan.id, number: 6, amount: 9538.10, capital: 9171.27, interest: 366.83, balance: 0, due_date: '2026-10-01', status: 'pending' },
  ])

  const { data: inst1 } = await supabase.from('installments').select('id').eq('loan_id', frenchLoan.id).eq('number', 1).single()
  const { data: inst2 } = await supabase.from('installments').select('id').eq('loan_id', frenchLoan.id).eq('number', 2).single()

  // Pay cuota 1 (late)
  await supabase.from('payments').insert({
    loan_id: frenchLoan.id, installment_id: inst1.id, client_id: juan.id, user_id: USER_ID,
    amount: 9570.42, capital_amount: 7538.10, interest_amount: 2000.00, late_amount: 47.61,
    type: 'installment', payment_date: '2026-05-02', method: 'cash', notes: 'Cuota 1 con 1 dia de mora', status: 'paid',
  })

  // Pay cuota 2 (on time)
  await supabase.from('payments').insert({
    loan_id: frenchLoan.id, installment_id: inst2.id, client_id: juan.id, user_id: USER_ID,
    amount: 9538.10, capital_amount: 7839.63, interest_amount: 1698.47,
    type: 'installment', payment_date: '2026-06-01', method: 'transfer', notes: 'Cuota 2 a tiempo', status: 'paid',
  })

  // Reversal cuota 2
  await supabase.from('payments').insert({
    loan_id: frenchLoan.id, installment_id: inst2.id, client_id: juan.id, user_id: USER_ID,
    amount: 9538.10, capital_amount: 7839.63, interest_amount: 1698.47,
    type: 'installment', payment_date: '2026-07-15', method: 'cash', notes: 'REVERSION: cuota 2', status: 'reversed',
  })

  await supabase.from('installments').update({ status: 'pending', paid_amount: 0, paid_at: null, paid_late_amount: 0 }).eq('id', inst2.id)

  // Capital abono (french, 10k)
  await supabase.from('payments').insert({
    loan_id: frenchLoan.id, client_id: juan.id, user_id: USER_ID,
    amount: 10000, capital_amount: 10000, interest_amount: 0,
    type: 'capital_abono', payment_date: '2026-07-18', method: 'transfer', notes: 'Abono voluntario a capital', status: 'paid',
  })

  await supabase.from('loans').update({ paid_amount: 19522.81, remaining_amount: 32461.90, paid_installments: 1 }).eq('id', frenchLoan.id)

  // Interest-only loan
  const { data: ioLoan } = await supabase.from('loans').insert({
    loan_id: 'L-IO-001', user_id: USER_ID, client_id: maria.id,
    amount: 100000, interest_type: 'percentage', interest_rate: 3,
    total_amount: 100000, total_interest: 3000, installment_amount: 3000, installments: 0,
    frequency: 'monthly', start_date: '2026-04-01', first_payment_date: '2026-05-01', payment_day: 1,
    amortization_type: 'interest_only', open_ended: true, status: 'active', late_interest_rate: 0.5,
  }).select('id').single()

  console.log('Préstamo interest-only:', ioLoan.id)

  // Pay interest month 1
  await supabase.from('payments').insert({
    loan_id: ioLoan.id, client_id: maria.id, user_id: USER_ID,
    amount: 3000, capital_amount: 0, interest_amount: 3000,
    type: 'installment', payment_date: '2026-05-01', method: 'cash', notes: 'Interes mes 1', status: 'paid',
  })

  // Pay interest month 2 (late)
  await supabase.from('payments').insert({
    loan_id: ioLoan.id, client_id: maria.id, user_id: USER_ID,
    amount: 3075, capital_amount: 0, interest_amount: 3000, late_amount: 75,
    type: 'installment', payment_date: '2026-06-05', method: 'cash', notes: 'Interes mes 2 con mora', status: 'paid',
  })

  // Capital abono IO
  await supabase.from('payments').insert({
    loan_id: ioLoan.id, client_id: maria.id, user_id: USER_ID,
    amount: 20000, capital_amount: 20000, interest_amount: 0,
    type: 'capital_abono', payment_date: '2026-06-15', method: 'transfer', notes: 'Abono a capital', status: 'paid',
  })

  await supabase.from('loans').update({ paid_amount: 26075, remaining_amount: 80000, installment_amount: 2400 }).eq('id', ioLoan.id)

  // Reversal interest month 2
  await supabase.from('payments').insert({
    loan_id: ioLoan.id, client_id: maria.id, user_id: USER_ID,
    amount: 3075, capital_amount: 0, interest_amount: 3000, late_amount: 75,
    type: 'installment', payment_date: '2026-07-10', method: 'cash', notes: 'REVERSION: interes mes 2', status: 'reversed',
  })

  await supabase.from('loans').update({ paid_amount: 23000 }).eq('id', ioLoan.id)

  // Liquidation
  await supabase.from('payments').insert({
    loan_id: ioLoan.id, client_id: maria.id, user_id: USER_ID,
    amount: 80000, capital_amount: 80000, interest_amount: 0,
    type: 'liquidation', payment_date: '2026-07-20', method: 'transfer', notes: 'Liquidacion total', status: 'paid',
  })

  await supabase.from('loans').update({ status: 'paid', paid_amount: 103000, remaining_amount: 0, progress: 100 }).eq('id', ioLoan.id)

  // Update client stats
  await supabase.rpc('update_client_stats', { p_client_id: juan.id })
  await supabase.rpc('update_client_stats', { p_client_id: maria.id })

  console.log('\n✅ SEED COMPLETADO EXITOSAMENTE')
  console.log('   Abre http://localhost:3000/login')
  console.log('   Email: yeysonmatos@outlook.com')
  console.log('   Pass:  admin123')
  console.log('\n   Juan Pérez        → L-FR-001 (francés, activo, 1 reverso, 1 abono)')
  console.log('   María García      → L-IO-001 (interest-only, liquidado, 1 abono, 1 reverso)')
}

seed().catch(console.error)
