'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import type { Installment, Payment, Client, Loan } from '@/types'

interface OpenEndedLoan {
  id: string
  loan_id: string
  amount: number
  installment_amount: number
  remaining_amount: number
  payment_day: number
  first_payment_date: string
  client: Client | undefined
}

function getNextDueDates(loan: OpenEndedLoan, count: number = 6): string[] {
  const dates: string[] = []
  const d = new Date(loan.first_payment_date)
  d.setDate(loan.payment_day || 1)
  const now = new Date()
  while (d <= now) {
    d.setMonth(d.getMonth() + 1)
  }
  for (let i = 0; i < count; i++) {
    const next = new Date(d)
    next.setMonth(next.getMonth() + i)
    dates.push(next.toISOString().split('T')[0])
  }
  return dates
}

interface Props {
  installments: Installment[]
  payments: Payment[]
  openEndedLoans: OpenEndedLoan[]
}

const pendingStatuses = ['pending', 'partial']

export default function CalendarContent({ installments, payments, openEndedLoans }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date())

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)

  const days = useMemo(() => {
    const d: Date[] = []
    let day = calStart
    while (day <= calEnd) {
      d.push(day)
      day = addDays(day, 1)
    }
    return d
  }, [currentDate])

  const events = useMemo(() => {
    const dueByDate: Record<string, (Installment | SyntheticInstallment)[]> = {}
    const paidByDate: Record<string, Payment[]> = {}

    interface SyntheticInstallment {
      id: string
      loan_id: string
      client_id: string
      amount: number
      number: number
      status: 'pending'
      due_date: string
      loan: Loan & { client?: Client }
    }

    installments.forEach(inst => {
      const key = inst.due_date
      if (!dueByDate[key]) dueByDate[key] = []
      dueByDate[key].push(inst)
    })

    openEndedLoans.forEach(loan => {
      const dates = getNextDueDates(loan, 12)
      dates.forEach(due => {
        if (!dueByDate[due]) dueByDate[due] = []
        dueByDate[due].push({
          id: `open_${loan.id}_${due}`,
          loan_id: loan.id,
          client_id: loan.client?.id || '',
          amount: loan.installment_amount,
          number: 0,
          status: 'pending' as const,
          due_date: due,
          loan: {
            id: loan.id,
            loan_id: loan.loan_id,
            user_id: '',
            client_id: loan.client?.id || '',
            amount: loan.amount,
            interest_type: 'percentage' as const,
            interest_rate: 0,
            total_amount: loan.amount,
            total_interest: 0,
            installment_amount: loan.installment_amount,
            installments: 0,
            paid_installments: 0,
            paid_amount: 0,
            remaining_amount: loan.remaining_amount,
            progress: 0,
            frequency: 'monthly' as const,
            start_date: loan.first_payment_date,
            first_payment_date: loan.first_payment_date,
            end_date: null,
            amortization_type: 'interest_only' as const,
            open_ended: true,
            payment_day: loan.payment_day,
            status: 'active' as const,
            late_days: 0,
            late_interest_rate: 0,
            guarantee: null,
            notes: null,
            paid_at: null,
            cancelled_at: null,
            created_at: loan.first_payment_date,
            updated_at: loan.first_payment_date,
            client: loan.client,
          } as Loan & { client?: Client },
        })
      })
    })

    payments.forEach(p => {
      const key = p.payment_date
      if (!paidByDate[key]) paidByDate[key] = []
      paidByDate[key].push(p)
    })

    return { dueByDate, paidByDate }
  }, [installments, payments, openEndedLoans])

  function formatKey(date: Date) {
    return format(date, 'yyyy-MM-dd')
  }

  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario"
        description="Vista mensual de cuotas y pagos"
      />

      <Card>
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <CaretLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground">
            {format(currentDate, "MMMM 'de' yyyy", { locale: es })}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <CaretRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {weekDays.map(d => (
            <div key={d} className="bg-background px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
          {days.map(day => {
            const key = formatKey(day)
            const dayDue = events.dueByDate[key] || []
            const dayPaid = events.paidByDate[key] || []
            const isToday = isSameDay(day, new Date())
            const isCurrent = isSameMonth(day, currentDate)
            const totalDue = dayDue.reduce((s, i) => s + Number(i.amount) - Number('paid_amount' in i ? (i.paid_amount || 0) : 0), 0)
            const totalPaid = dayPaid.reduce((s, p) => s + Number(p.amount), 0)

            return (
              <div
                key={key}
                className={`bg-card min-h-[80px] p-1.5 ${
                  !isCurrent ? 'opacity-40' : ''
                } ${isToday ? 'ring-2 ring-primary ring-inset' : ''}`}
              >
                <p className={`text-xs font-medium mb-1 ${
                  isToday ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {format(day, 'd')}
                </p>
                {dayDue.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-destructive font-medium">
                      {dayDue.length} vencen · {formatCurrency(totalDue)}
                    </p>
                    {dayDue.some(i => pendingStatuses.includes(i.status) && parseISO(i.due_date) < new Date()) && (
                      <p className="text-[10px] text-destructive font-medium">Atrasado</p>
                    )}
                  </div>
                )}
                {dayPaid.length > 0 && (
                  <p className="text-[10px] text-success font-medium">
                    {formatCurrency(totalPaid)} cobrado
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-foreground mb-4">
          Cuotas del {format(currentDate, "MMMM 'de' yyyy", { locale: es })}
        </h3>
        {installments.filter(i => isSameMonth(parseISO(i.due_date), currentDate) && pendingStatuses.includes(i.status)).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No hay cuotas pendientes este mes</p>
        ) : (
          <div className="space-y-2">
            {installments
              .filter(i => isSameMonth(parseISO(i.due_date), currentDate) && pendingStatuses.includes(i.status))
              .slice(0, 10)
              .map(inst => (
                <div key={inst.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {inst.loan?.client?.name} · Cuota #{inst.number}
                    </p>
                    <p className="text-xs text-muted-foreground">Vence: {formatDate(inst.due_date)}</p>
                  </div>
<div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{formatCurrency(inst.amount)}</span>
                      <Badge variant={
                        inst.status === 'partial' ? 'active' :
                        parseISO(inst.due_date) < new Date() ? 'late' : 'active'
                      }>
                        {inst.status === 'partial' ? 'Parcial' :
                         parseISO(inst.due_date) < new Date() ? 'Atrasado' : 'Pendiente'}
                      </Badge>
                  </div>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  )
}
