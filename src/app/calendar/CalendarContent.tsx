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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Installment, Payment } from '@/types'

interface OpenEndedLoan {
  id: string
  loan_id: string
  amount: number
  installment_amount: number
  remaining_amount: number
  payment_day: number
  first_payment_date: string
  client: { id: string; name: string; phone: string | null } | null
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
    const dueByDate: Record<string, (Installment | { id: string; loan_id: string; amount: number; number: number; loan: { client: { id: string; name: string } | null; loan_id: string } })[]> = {}
    const paidByDate: Record<string, Payment[]> = {}

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
          amount: loan.installment_amount,
          number: 0,
          loan: { client: loan.client, loan_id: loan.loan_id },
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
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground">
            {format(currentDate, "MMMM 'de' yyyy", { locale: es })}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-5 w-5" />
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
            const totalDue = dayDue.reduce((s, i) => s + Number(i.amount), 0)
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
        {installments.filter(i => isSameMonth(parseISO(i.due_date), currentDate) && i.status === 'pending').length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No hay cuotas pendientes este mes</p>
        ) : (
          <div className="space-y-2">
            {installments
              .filter(i => isSameMonth(parseISO(i.due_date), currentDate) && i.status === 'pending')
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
                    <Badge variant={inst.status === 'pending' ? 'active' : 'paid'}>
                      {inst.status === 'pending' ? 'Pendiente' : 'Pagado'}
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
