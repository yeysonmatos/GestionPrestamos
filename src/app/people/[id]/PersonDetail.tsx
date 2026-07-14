'use client'

import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import type { Person, Loan } from '@/types'
import { useState } from 'react'

interface Props {
  person: Person
  loans: Loan[]
}

export default function PersonDetail({ person: initialPerson, loans: initialLoans }: Props) {
  const [person, setPerson] = useState(initialPerson)
  const [loans, setLoans] = useState(initialLoans)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(person.name)
  const [notes, setNotes] = useState(person.notes)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const totalLent = loans.reduce((s, l) => s + Number(l.amount), 0)
  const activeLoans = loans.filter(l => l.status === 'active')
  const paidLoans = loans.filter(l => l.status === 'paid')

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase
      .from('people')
      .update({ name, notes })
      .eq('id', person.id)
      .select()
      .single()

    if (!error && data) {
      setPerson(data)
      setEditing(false)
    }

    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{person.name}</h1>
            {person.notes && <p className="text-sm text-muted-foreground mt-1">{person.notes}</p>}
          </div>
          <Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button>
        </CardHeader>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total prestado</p>
            <p className="text-xl font-bold">{formatCurrency(totalLent)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Préstamos activos</p>
            <p className="text-xl font-bold text-warning">{activeLoans.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pagados</p>
            <p className="text-xl font-bold text-success">{paidLoans.length}</p>
          </div>
        </div>
      </Card>

      <CardHeader>
        <CardTitle>Préstamos con {person.name}</CardTitle>
        <Link href={`/loans/new?person_id=${person.id}`}>
          <Button size="sm">Nuevo préstamo</Button>
        </Link>
      </CardHeader>

      {loans.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm text-center py-8">
            No hay préstamos registrados con esta persona.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {loans.map(loan => (
            <Card key={loan.id} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {formatCurrency(Number(loan.amount), loan.currency as any)}
                  </span>
                  <Badge variant={loan.status}>{loan.status === 'active' ? 'Activo' : loan.status === 'paid' ? 'Pagado' : 'Cancelado'}</Badge>
                </div>
                {loan.description && (
                  <p className="text-xs text-muted-foreground mt-1">{loan.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(loan.date)}</p>
              </div>
              <Link href={`/loans/${loan.id}`}>
                <Button variant="ghost" size="sm">Ver detalle</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEditing(false)} />
          <div className="relative bg-card rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold mb-4">Editar persona</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <Input label="Nombre" value={name} onChange={e => setName(e.target.value)} required />
              <Input label="Notas" value={notes} onChange={e => setNotes(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button type="submit" loading={loading}>Guardar</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
