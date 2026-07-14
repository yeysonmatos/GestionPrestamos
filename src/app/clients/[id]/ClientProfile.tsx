'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Progress } from '@/components/ui/Progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import Input from '@/components/ui/Input'
import { formatCurrency, formatDate, getTrustLevelColor, getStatusLabel, getInitials } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import Link from 'next/link'
import { ArrowLeft, Pencil, Phone, Mail, MapPin, Briefcase, DollarSign, FileText } from 'lucide-react'
import type { Client, Loan, Payment, Document } from '@/types'

interface Props {
  client: Client
  loans: Loan[]
  payments: Payment[]
  documents: Document[]
}

export default function ClientProfile({ client: initialClient, loans, payments, documents }: Props) {
  const [client, setClient] = useState(initialClient)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...client })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data, error } = await supabase
      .from('clients')
      .update(form)
      .eq('id', client.id)
      .select()
      .single()
    if (!error && data) {
      setClient(data)
      setEditing(false)
    }
    setSaving(false)
  }

  const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'late')

  return (
    <div className="space-y-6">
      <Link href="/clients" className="text-sm text-primary hover:underline flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Volver a clientes
      </Link>

      <Card>
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <Avatar name={client.name} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
              <Badge variant={client.status === 'active' ? 'active' : 'cancelled'}>
                {getStatusLabel(client.status)}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {client.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {client.phone}</span>}
              {client.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {client.email}</span>}
              {client.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {client.address}</span>}
              {client.document && <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {client.document}</span>}
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {client.occupation && <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {client.occupation}</span>}
              {client.workplace && <span>{client.workplace}</span>}
              {client.monthly_income > 0 && <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Ingreso: {formatCurrency(client.monthly_income)}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Nivel de confianza</p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-1 ${getTrustLevelColor(client.trust_level)}`}>
              {getStatusLabel(client.trust_level)}
            </span>
            <div className="flex items-center gap-2 mt-2">
              <Progress value={client.trust_score} variant={client.trust_level === 'high' ? 'green' : client.trust_level === 'medium' ? 'yellow' : 'red'} className="w-24" />
              <span className="text-xs text-muted-foreground">{client.trust_score}%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">Total prestado</p>
            <p className="font-semibold text-foreground">{formatCurrency(client.total_borrowed)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total pagado</p>
            <p className="font-semibold text-success">{formatCurrency(client.total_paid)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saldo pendiente</p>
            <p className="font-semibold text-warning">{formatCurrency(client.balance)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Préstamos</p>
            <p className="font-semibold text-foreground">{client.active_loans} activos / {client.paid_loans} pagados</p>
          </div>
        </div>
      </Card>

      <Tabs value="loans">
        <TabsList>
          <TabsTrigger value="loans">Préstamos activos ({activeLoans.length})</TabsTrigger>
          <TabsTrigger value="payments">Historial de pagos</TabsTrigger>
          <TabsTrigger value="documents">Documentos ({documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="loans">
          {activeLoans.length === 0 ? (
            <Card><p className="text-sm text-muted-foreground text-center py-8">No hay préstamos activos</p></Card>
          ) : (
            <div className="space-y-3">
              {activeLoans.map(loan => (
                <Link key={loan.id} href={`/loans/${loan.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{formatCurrency(loan.amount)}</p>
                        <p className="text-xs text-muted-foreground">{loan.loan_id} · {formatDate(loan.start_date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">{loan.paid_installments}/{loan.installments} cuotas</p>
                        <Progress value={loan.progress} className="w-24 mt-1" />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {payments.length === 0 ? (
            <Card><p className="text-sm text-muted-foreground text-center py-8">Sin pagos registrados</p></Card>
          ) : (
            <Card>
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-foreground">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">{p.method} · {p.notes}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents">
          {documents.length === 0 ? (
            <Card><p className="text-sm text-muted-foreground text-center py-8">Sin documentos</p></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map(doc => (
                <Card key={doc.id} className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.type}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEditing(false)} />
          <div className="relative bg-card rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Editar cliente</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <Input label="Nombre" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                <Input label="Teléfono" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Documento" value={form.document || ''} onChange={e => setForm(p => ({ ...p, document: e.target.value }))} />
                <Input label="Dirección" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Ocupación" value={form.occupation || ''} onChange={e => setForm(p => ({ ...p, occupation: e.target.value }))} />
                <Input label="Lugar de trabajo" value={form.workplace || ''} onChange={e => setForm(p => ({ ...p, workplace: e.target.value }))} />
              </div>
              <Input label="Ingreso mensual" type="number" value={form.monthly_income} onChange={e => setForm(p => ({ ...p, monthly_income: parseFloat(e.target.value) || 0 }))} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button type="submit" loading={saving}>Guardar</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
