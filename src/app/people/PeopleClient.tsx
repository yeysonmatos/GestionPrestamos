'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import BottomSheet from '@/components/ui/BottomSheet'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import type { Person, Loan } from '@/types'

interface Props {
  people: Person[]
  loans: Loan[]
}

export default function PeopleClient({ people: initialPeople, loans }: Props) {
  const [people, setPeople] = useState(initialPeople)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase
      .from('people')
      .insert({ name, notes })
      .select()
      .single()

    if (!error && data) {
      setPeople(prev => [...prev, data])
      setShowModal(false)
      setName('')
      setNotes('')
    }

    setLoading(false)
  }

  function getPersonStats(personId: string) {
    const personLoans = loans.filter((l: any) => l.person_id === personId)
    const total = personLoans.reduce((s, l) => s + Number(l.amount), 0)
    const active = personLoans.filter(l => l.status === 'active').length
    return { total, active }
  }

  return (
    <div className="space-y-6">
      <CardHeader>
        <CardTitle>Personas</CardTitle>
        <Button onClick={() => setShowModal(true)}>Agregar persona</Button>
      </CardHeader>

      {people.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm text-center py-8">
            No has agregado ninguna persona aún.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {people.map(person => {
            const stats = getPersonStats(person.id)
            return (
              <Link key={person.id} href={`/people/${person.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <h3 className="font-semibold text-foreground">{person.name}</h3>
                  {person.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{person.notes}</p>
                  )}
                  <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                    <span>{stats.active} activos</span>
                    <span>{formatCurrency(stats.total)} total</span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <BottomSheet open={showModal} onClose={() => setShowModal(false)} title="Nueva persona">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Nombre"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre completo"
            required
          />
          <Input
            label="Notas (opcional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Teléfono, referencia, etc."
          />
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={loading} className="flex-1">Guardar</Button>
          </div>
        </form>
      </BottomSheet>
    </div>
  )
}
