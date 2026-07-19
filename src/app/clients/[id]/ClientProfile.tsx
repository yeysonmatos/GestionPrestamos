'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import Input, { Select } from '@/components/ui/Input'
import { formatCurrency, formatDate, getTrustLevelColor, getStatusLabel } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import Link from 'next/link'
import { ArrowLeft, Pencil, Phone, Mail, MapPin, FileText, Calendar, DollarSign, TrendingUp, Wallet, CreditCard } from 'lucide-react'
import type { Client, Loan, Payment, Document } from '@/types'

interface Props {
  client: Client
  loans: Loan[]
  payments: Payment[]
  documents: Document[]
}

const statusColor: Record<string, string> = {
  active: 'bg-blue-500',
  late: 'bg-red-500',
  paid: 'bg-green-500',
  cancelled: 'bg-gray-400',
  default: 'bg-gray-300',
}

const paymentMethodIcons: Record<string, string> = {
  cash: '\uD83D\uDCB0',
  transfer: '\uD83C\uDFE6',
  deposit: '\uD83D\uDCE5',
}

export default function ClientProfile({ client: initialClient, loans, payments, documents }: Props) {
  const [client, setClient] = useState(initialClient)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState('loans')
  const [form, setForm] = useState({
    first_name: client.first_name || '',
    last_name: client.last_name || '',
    nickname: client.nickname || '',
    sex: client.sex || '',
    document_type: client.document_type || 'cedula',
    document: client.document || '',
    phone: client.phone || '',
    whatsapp: client.whatsapp || '',
    phone_alt: client.phone_alt || '',
    email: client.email || '',
    provincia: client.provincia || '',
    municipio: client.municipio || '',
    sector: client.sector || '',
    calle: client.calle || '',
    numero: client.numero || '',
    referencia: client.referencia || '',
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const activeLoans = useMemo(() =>
    loans.filter(l => l.status === 'active' || l.status === 'late'),
    [loans]
  )

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const fullName = `${form.first_name} ${form.last_name}`.trim()
    const { data, error } = await supabase
      .from('clients')
      .update({
        name: fullName,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        nickname: form.nickname || null,
        sex: form.sex || null,
        document_type: form.document_type || null,
        document: form.document || null,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        phone_alt: form.phone_alt || null,
        email: form.email || null,
        provincia: form.provincia || null,
        municipio: form.municipio || null,
        sector: form.sector || null,
        calle: form.calle || null,
        numero: form.numero || null,
        referencia: form.referencia || null,
      })
      .eq('id', client.id)
      .select()
      .single()
    if (!error && data) {
      setClient(data)
      setEditing(false)
    }
    setSaving(false)
  }

  const initials = (client.first_name?.charAt(0) || client.name.charAt(0)) +
    (client.last_name?.charAt(0) || client.name.split(' ')[1]?.charAt(0) || '')
  const avatarBg = client.status === 'active' ? 'bg-blue-500' : 'bg-gray-400'

  return (
    <div className="space-y-6">
      <Link href="/clients" className="text-sm text-primary hover:underline inline-flex items-center gap-1 w-fit">
        <ArrowLeft className="h-4 w-4" /> Volver a clientes
      </Link>

      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-white">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center font-bold text-2xl text-white flex-shrink-0">
              {initials.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{client.name}</h1>
                <Badge variant={client.status === 'active' ? 'active' : 'cancelled'}>
                  {getStatusLabel(client.status)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-white/80">
                {client.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {client.phone}</span>}
                {client.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {client.email}</span>}
                {client.document && <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {client.document}</span>}
                {client.nickname && <span className="opacity-70">&ldquo;{client.nickname}&rdquo;</span>}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-white/80 hover:text-white hover:bg-white/10">
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 flex items-center gap-4 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${getTrustLevelColor(client.trust_level)}`}>
            {getStatusLabel(client.trust_level)}
          </span>
          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
            <Progress value={client.trust_score} variant={client.trust_level === 'high' ? 'green' : client.trust_level === 'medium' ? 'yellow' : 'red'} className="flex-1 h-1.5" />
            <span className="text-xs text-muted-foreground">{client.trust_score}%</span>
          </div>
          {client.provincia && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {client.provincia}{client.municipio ? `, ${client.municipio}` : ''}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-t border-border">
          <div className="px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">Total prestado</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(client.total_borrowed)}</p>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">Total pagado</p>
            <p className="text-lg font-bold text-success">{formatCurrency(client.total_paid)}</p>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">Saldo pendiente</p>
            <p className="text-lg font-bold text-warning">{formatCurrency(client.balance)}</p>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">Préstamos</p>
            <p className="text-lg font-bold text-foreground">{client.active_loans} activos / {client.paid_loans} pagados</p>
          </div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="loans">
            <CreditCard className="h-4 w-4 mr-1.5" />
            Préstamos activos ({activeLoans.length})
          </TabsTrigger>
          <TabsTrigger value="payments">
            <TrendingUp className="h-4 w-4 mr-1.5" />
            Historial de pagos
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-1.5" />
            Documentos ({documents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="loans">
          {activeLoans.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CreditCard className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No hay préstamos activos</p>
                <p className="text-xs text-muted-foreground mt-1">Los préstamos activos aparecerán aquí</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeLoans.map(loan => {
                const borderColor = loan.status === 'late' ? 'bg-red-500' : 'bg-blue-500'
                return (
                  <Link key={loan.id} href={`/loans/${loan.id}`}>
                    <Card className="relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer pl-0">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${borderColor}`} />
                      <div className="flex items-center justify-between pl-4 pr-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            $
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-foreground">{formatCurrency(loan.amount)}</p>
                            <p className="text-xs text-muted-foreground">{loan.loan_id} &middot; {formatDate(loan.start_date)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground">{loan.paid_installments}/{loan.installments} cuotas</p>
                          <Progress value={loan.progress} className="w-24 h-1.5 mt-1 ml-auto" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {payments.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Wallet className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">Sin pagos registrados</p>
                <p className="text-xs text-muted-foreground mt-1">Los pagos aparecerán aquí cuando se realicen</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {payments.map(p => (
                <Card key={p.id} className="flex items-center gap-3">
                  <span className="text-xl">{paymentMethodIcons[p.method] || '\uD83D\uDCB5'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{formatCurrency(p.amount)}</span>
                      <Badge variant={p.type === 'liquidation' ? 'active' : p.type === 'capital_abono' ? 'default' : 'paid'}>
                        {p.type === 'liquidation' ? 'Liquidación' : p.type === 'capital_abono' ? 'Abono' : 'Cuota'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : 'Depósito'}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(p.payment_date)}</span>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents">
          {documents.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">Sin documentos</p>
                <p className="text-xs text-muted-foreground mt-1">Los documentos subidos aparecerán aquí</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map(doc => (
                <Card key={doc.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{doc.type}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</span>
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
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Información Personal</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Nombres *" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} required />
                  <Input label="Apellidos *" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} required />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Input label="Apodo" value={form.nickname} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))} placeholder="Opcional" />
                  <Select label="Sexo" value={form.sex} onChange={e => setForm(p => ({ ...p, sex: e.target.value }))}
                    options={[{ value: '', label: 'Seleccionar...' }, { value: 'M', label: 'Masculino' }, { value: 'F', label: 'Femenino' }]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Select label="Tipo documento" value={form.document_type} onChange={e => setForm(p => ({ ...p, document_type: e.target.value }))}
                    options={[{ value: 'cedula', label: 'Cédula' }, { value: 'pasaporte', label: 'Pasaporte' }, { value: 'otro', label: 'Otro' }]}
                  />
                  <Input label="N° Documento" value={form.document} onChange={e => setForm(p => ({ ...p, document: e.target.value }))} />
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Contacto</h4>
                <Input label="Teléfono principal *" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} required />
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Input label="WhatsApp" type="tel" value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))} placeholder="Si es el mismo dejar vacío" />
                  <Input label="Teléfono secundario" type="tel" value={form.phone_alt} onChange={e => setForm(p => ({ ...p, phone_alt: e.target.value }))} />
                </div>
                <Input label="Correo electrónico" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-3" />
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Dirección</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Provincia" value={form.provincia} onChange={e => setForm(p => ({ ...p, provincia: e.target.value }))} />
                  <Input label="Municipio" value={form.municipio} onChange={e => setForm(p => ({ ...p, municipio: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Input label="Sector" value={form.sector} onChange={e => setForm(p => ({ ...p, sector: e.target.value }))} />
                  <Input label="Calle" value={form.calle} onChange={e => setForm(p => ({ ...p, calle: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Input label="N° Casa/Apto" value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} />
                  <Input label="Punto de referencia" value={form.referencia} onChange={e => setForm(p => ({ ...p, referencia: e.target.value }))} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
