'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import Input, { Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase-client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateLoan } from '@/lib/calculations'
import { FREQUENCIES } from '@/types'
import type { Client, Setting } from '@/types'

interface Props {
  clients: Client[]
  settings: Setting | null
  selectedClientId?: string
}

const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

export default function NewLoanForm({ clients, settings, selectedClientId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    client_id: selectedClientId || '',
    amount: '',
    interest_type: 'percentage' as 'percentage' | 'fixed',
    interest_rate: '',
    installments: String(settings?.default_installments || 10),
    frequency: settings?.default_frequency || 'weekly',
    amortization_type: 'interest_only' as 'interest_only' | 'french',
    open_ended: false,
    payment_day: '',
    start_date: new Date().toISOString().split('T')[0],
    first_payment_date: '',
    guarantee: '',
    notes: '',
  })

  const isInterestOnly = form.amortization_type === 'interest_only'

  const schedule = useMemo(() => {
    const amount = parseFloat(form.amount)
    const rate = parseFloat(form.interest_rate)
    const numInstallments = parseInt(form.installments)
    if (!amount || !rate || !form.start_date || !form.first_payment_date) return null
    if (!form.open_ended && !numInstallments) return null

    try {
      return calculateLoan({
        amount,
        interest_type: form.interest_type,
        interest_rate: rate,
        installments: form.open_ended ? 0 : numInstallments,
        frequency: form.frequency as 'daily' | 'weekly' | 'biweekly' | 'monthly',
        start_date: form.first_payment_date,
        amortization_type: form.amortization_type,
        open_ended: form.open_ended,
      })
    } catch {
      return null
    }
  }, [form.amount, form.interest_rate, form.interest_type, form.installments, form.frequency, form.first_payment_date, form.amortization_type, form.open_ended, form.start_date])

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!form.client_id) { setError('Selecciona un cliente'); setLoading(false); return }
    if (!schedule) { setError('Revisa los valores ingresados'); setLoading(false); return }

    const amount = parseFloat(form.amount)
    const rate = parseFloat(form.interest_rate)
    const numInstallments = form.open_ended ? 0 : parseInt(form.installments)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Debes iniciar sesión'); setLoading(false); return }

    const { data: settingsData } = await supabase
      .from('settings')
      .select('loan_id_prefix')
      .single()

    const prefix = settingsData?.loan_id_prefix || 'L-'
    const loanId = `${prefix}${String(Date.now()).slice(-6)}`

    const { data: loan, error: err } = await supabase
      .from('loans')
      .insert({
        loan_id: loanId,
        user_id: user.id,
        client_id: form.client_id,
        amount,
        interest_type: form.interest_type,
        interest_rate: rate,
        amortization_type: form.amortization_type,
        open_ended: form.open_ended,
        payment_day: form.open_ended ? parseInt(form.payment_day) || null : null,
        total_amount: schedule.total_amount,
        total_interest: schedule.total_interest,
        installment_amount: schedule.installment_amount,
        remaining_amount: isInterestOnly ? amount : schedule.total_amount,
        installments: numInstallments,
        frequency: form.frequency,
        start_date: form.start_date,
        first_payment_date: form.first_payment_date,
        guarantee: form.guarantee || null,
        notes: form.notes || null,
      })
      .select()
      .single()

    if (err) { setError(err.message); setLoading(false); return }

    if (!form.open_ended && schedule.installments.length > 0) {
      const installmentsData = schedule.installments.map(inst => ({
        loan_id: loan.id,
        client_id: form.client_id,
        number: inst.number,
        amount: inst.amount,
        capital: inst.capital,
        interest: inst.interest,
        balance: inst.balance,
        due_date: inst.due_date,
      }))

      const { error: instErr } = await supabase
        .from('installments')
        .insert(installmentsData)

      if (instErr) { setError(instErr.message); setLoading(false); return }
    }

    await supabase.rpc('update_client_stats', { p_client_id: form.client_id })

    router.push(`/loans/${loan.id}`)
    router.refresh()
    setLoading(false)
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

        <Select label="Cliente" value={form.client_id} onChange={e => update('client_id', e.target.value)}
          options={[{ value: '', label: 'Seleccionar cliente...' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input label="Monto" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => update('amount', e.target.value)} required />
          <div className="grid grid-cols-2 gap-2">
            <Select label="Tipo interés" value={form.interest_type} onChange={e => update('interest_type', e.target.value)}
              options={[{ value: 'percentage', label: 'Porcentaje %' }, { value: 'fixed', label: 'Monto fijo' }]}
            />
            <Input label={form.interest_type === 'percentage' ? 'Tasa %' : 'Monto'} type="number" step="0.01" min="0" value={form.interest_rate} onChange={e => update('interest_rate', e.target.value)} required />
          </div>
        </div>

        <Select label="Tipo de amortización" value={form.amortization_type} onChange={e => update('amortization_type', e.target.value)}
          options={[
            { value: 'interest_only', label: 'Solo interés (Modelo Dominicano)' },
            { value: 'french', label: 'Francesa (Cuota fija)' },
          ]}
        />

        {isInterestOnly && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.open_ended} onChange={e => setForm(prev => ({ ...prev, open_ended: e.target.checked }))}
              className="rounded border-border h-4 w-4" />
            Sin límite de cuotas (préstamo abierto)
          </label>
        )}

        <div className="grid grid-cols-3 gap-4">
          {!form.open_ended && (
            <Input label="N° Cuotas" type="number" min="1" value={form.installments} onChange={e => update('installments', e.target.value)} required />
          )}
          <Select label="Frecuencia" value={form.frequency} onChange={e => update('frequency', e.target.value)}
            options={FREQUENCIES.map(f => ({ value: f.value, label: f.label }))}
          />
          <Input label="Inicio" type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="Fecha primer pago" type="date" value={form.first_payment_date} onChange={e => update('first_payment_date', e.target.value)} required />
          {form.open_ended && (
            <Select label="Día de pago" value={form.payment_day} onChange={e => update('payment_day', e.target.value)}
              options={[{ value: '', label: 'Seleccionar...' }, ...DAYS]}
            />
          )}
        </div>

        <Input label="Garantía (opcional)" value={form.guarantee} onChange={e => update('guarantee', e.target.value)} placeholder="Ej: Vehículo, propiedad..." />
        <Input label="Notas (opcional)" value={form.notes} onChange={e => update('notes', e.target.value)} />

        {schedule && (() => {
          const daysPerFreq: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 }
          const numInst = parseInt(form.installments) || 0
          const tiempoMeses = numInst > 0 ? Math.round(numInst * (daysPerFreq[form.frequency] || 30) / 30) : 0

          return (
            <div className="bg-primary-light rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-800">Resumen del cálculo</p>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div className="bg-white rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Monto del préstamo</p>
                  <p className="font-semibold text-foreground">{formatCurrency(parseFloat(form.amount) || 0)}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Total de intereses</p>
                  <p className="font-semibold text-foreground">{formatCurrency(schedule.total_interest)}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Tasa de interés</p>
                  <p className="font-semibold text-foreground">{form.interest_type === 'percentage' ? `${form.interest_rate}%` : formatCurrency(parseFloat(form.interest_rate) || 0)}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Monto total</p>
                  <p className="font-semibold text-foreground">{formatCurrency(schedule.total_amount)}</p>
                </div>
              </div>
              {schedule.installments.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">#</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Capital</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Interés</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Cuota (C+I)</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Fecha pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.installments.map(inst => (
                        <tr key={inst.number} className="border-b border-border hover:bg-white/50">
                          <td className="py-1.5 px-2 font-medium">{inst.number}</td>
                          <td className="py-1.5 px-2 text-right">{formatCurrency(inst.capital)}</td>
                          <td className="py-1.5 px-2 text-right">{formatCurrency(inst.interest)}</td>
                          <td className="py-1.5 px-2 text-right font-medium">{formatCurrency(inst.amount)}</td>
                          <td className="py-1.5 px-2 text-right">{formatDate(inst.due_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {form.open_ended && (
                <p className="text-xs text-primary mt-1">Préstamo abierto — paga {formatCurrency(schedule.installment_amount)} de interés cada período</p>
              )}
            </div>
          )
        })()}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" loading={loading}>Crear préstamo</Button>
        </div>
      </form>
    </Card>
  )
}
