'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import BottomSheet from '@/components/ui/BottomSheet'
import Input, { Select } from '@/components/ui/Input'
import { Progress } from '@/components/ui/Progress'
import { formatCurrency, getTrustLevelColor, getStatusLabel } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Phone, FileText, CaretDown, ArrowsClockwise } from '@phosphor-icons/react'
import ActionSheet from '@/components/ui/ActionSheet'
import type { Client, Loan } from '@/types'

interface Props {
  clients: Client[]
  loans: Loan[]
}

const statusColorMap: Record<string, string> = {
  active: 'bg-blue-500',
  inactive: 'bg-gray-400',
  default: 'bg-gray-300',
}

const avatarColorMap: Record<string, string> = {
  active: 'bg-blue-500',
  inactive: 'bg-gray-400',
  default: 'bg-gray-400',
}

export default function ClientsClient({ clients: initialClients, loans }: Props) {
  const [clients, setClients] = useState(initialClients)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    first_name: '', last_name: '', nickname: '', sex: '', document_type: 'cedula',
    document: '', phone: '', whatsapp: '', phone_alt: '', email: '',
    provincia: '', municipio: '', sector: '', calle: '', numero: '', referencia: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const loanCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const l of loans) {
      map[l.client_id] = (map[l.client_id] || 0) + 1
    }
    return map
  }, [loans])

  const filtered = useMemo(() => {
    return clients.filter(c => {
      const q = search.toLowerCase()
      const matchesSearch = !search || 
        c.name.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.document?.includes(q)
      const matchesFilter = filter === 'all' || c.status === filter
      return matchesSearch && matchesFilter
    })
  }, [clients, search, filter])

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const fullName = `${form.first_name} ${form.last_name}`.trim()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Debes iniciar sesión')
      setLoading(false)
      return
    }
    const { data, error: insertError } = await supabase
      .from('clients')
      .insert({
        name: fullName,
        user_id: user.id,
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
      .select()
      .single()
    if (insertError) {
      console.error('Error al crear cliente:', insertError)
      setError(insertError.message)
      setLoading(false)
      return
    }
    if (!data) {
      setError('No se recibieron datos del servidor')
      setLoading(false)
      return
    }
    setClients(prev => [data, ...prev])
    setShowModal(false)
    setForm({
      first_name: '', last_name: '', nickname: '', sex: '', document_type: 'cedula',
      document: '', phone: '', whatsapp: '', phone_alt: '', email: '',
      provincia: '', municipio: '', sector: '', calle: '', numero: '', referencia: '',
    })
    setLoading(false)
  }

  const tabs = [
    { key: 'all' as const, label: 'Todos', count: clients.length },
    { key: 'active' as const, label: 'Activos', count: clients.filter(c => c.status === 'active').length },
    { key: 'inactive' as const, label: 'Inactivos', count: clients.filter(c => c.status === 'inactive').length },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Gestiona tus clientes y su información"
        action={<div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => router.refresh()} className="min-h-11 min-w-11 p-0 flex items-center justify-center"><ArrowsClockwise className="h-4 w-4" /></Button><Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button></div>}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, teléfono o documento..." className="flex-1" />
        <button onClick={() => setShowFilterSheet(true)}
          className="w-full sm:hidden flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm bg-card min-h-11">
          <span className="font-medium">{tabs.find(t => t.key === filter)?.label || 'Todos'}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">({tabs.find(t => t.key === filter)?.count || 0})</span>
            <CaretDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
        <ActionSheet open={showFilterSheet} onClose={() => setShowFilterSheet(false)}
          options={tabs} selected={filter} onSelect={v => setFilter(v as any)} title="Filtrar clientes" />
        <div className="hidden sm:flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === tab.key
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-border'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'Sin resultados' : 'No hay clientes'}
          description={search ? 'Intenta con otros términos de búsqueda' : 'Agrega tu primer cliente para empezar.'}
          icon={<span className="text-2xl">{search ? '🔍' : '👤'}</span>}
          action={!search ? <Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(client => {
            const statusColor = statusColorMap[client.status] || statusColorMap.default
            const avatarColor = avatarColorMap[client.status] || avatarColorMap.default
            const initials = client.name.split(' ').map(s => s.charAt(0)).join('').toUpperCase().slice(0, 2) || '?'
            const activeLoans = loanCounts[client.id] || 0

            return (
              <Link key={client.id} href={`/clients/${client.id}`}>
                <Card className="relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer pl-0">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColor}`} />
                  <div className="flex items-start gap-3 py-3 pl-4 pr-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${avatarColor}`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-foreground truncate">{client.name}</h3>
                        <Badge variant={client.status === 'active' ? 'active' : 'cancelled'}>
                          {getStatusLabel(client.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {client.phone && (
                          <span className="flex items-center gap-1 text-primary">
                            <Phone className="h-3 w-3" /> {client.phone}
                          </span>
                        )}
                        {client.document && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" /> {client.document}
                          </span>
                        )}
                        <span>{activeLoans} préstamo{activeLoans !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 pb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Progress value={client.trust_score} variant={client.trust_level === 'high' ? 'green' : client.trust_level === 'medium' ? 'yellow' : 'red'} className="flex-1 h-1.5" />
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${getTrustLevelColor(client.trust_level)}`}>
                          {getStatusLabel(client.trust_level)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                      <div>Prestado: <span className="font-medium text-foreground">{formatCurrency(client.total_borrowed)}</span></div>
                      <div>Saldo: <span className="font-medium text-foreground">{formatCurrency(client.balance)}</span></div>
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <BottomSheet open={showModal} onClose={() => { setShowModal(false); setForm({ first_name: '', last_name: '', nickname: '', sex: '', document_type: 'cedula', document: '', phone: '', whatsapp: '', phone_alt: '', email: '', provincia: '', municipio: '', sector: '', calle: '', numero: '', referencia: '' }) }} title="Nuevo cliente">
        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Información Personal</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nombres *" value={form.first_name} onChange={e => update('first_name', e.target.value)} required />
              <Input label="Apellidos *" value={form.last_name} onChange={e => update('last_name', e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Input label="Apodo" value={form.nickname} onChange={e => update('nickname', e.target.value)} placeholder="Opcional" />
              <Select label="Sexo" value={form.sex} onChange={e => update('sex', e.target.value)}
                options={[{ value: '', label: 'Seleccionar...' }, { value: 'M', label: 'Masculino' }, { value: 'F', label: 'Femenino' }]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Select label="Tipo documento" value={form.document_type} onChange={e => update('document_type', e.target.value)}
                options={[{ value: 'cedula', label: 'Cédula' }, { value: 'pasaporte', label: 'Pasaporte' }, { value: 'otro', label: 'Otro' }]}
              />
              <Input label="N° Documento" value={form.document} onChange={e => update('document', e.target.value)} />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Contacto</h4>
            <Input label="Teléfono principal *" type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} required />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Input label="WhatsApp" type="tel" value={form.whatsapp} onChange={e => update('whatsapp', e.target.value)} placeholder="Si es el mismo dejar vacío" />
              <Input label="Teléfono secundario" type="tel" value={form.phone_alt} onChange={e => update('phone_alt', e.target.value)} />
            </div>
            <Input label="Correo electrónico" type="email" value={form.email} onChange={e => update('email', e.target.value)} className="mt-3" />
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Dirección</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Provincia" value={form.provincia} onChange={e => update('provincia', e.target.value)} />
              <Input label="Municipio" value={form.municipio} onChange={e => update('municipio', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Input label="Sector" value={form.sector} onChange={e => update('sector', e.target.value)} />
              <Input label="Calle" value={form.calle} onChange={e => update('calle', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Input label="N° Casa/Apto" value={form.numero} onChange={e => update('numero', e.target.value)} />
              <Input label="Punto de referencia" value={form.referencia} onChange={e => update('referencia', e.target.value)} placeholder="Casa azul frente al colmado..." />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={loading} className="flex-1">Guardar</Button>
          </div>
        </form>
      </BottomSheet>
    </div>
  )
}
