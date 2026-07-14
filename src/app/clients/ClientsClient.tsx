'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import Modal from '@/components/ui/Modal'
import Input, { Select } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { Progress } from '@/components/ui/Progress'
import { formatCurrency, getTrustLevelColor, getStatusLabel } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import type { Client, Loan } from '@/types'

interface Props {
  clients: Client[]
  loans: Loan[]
}

export default function ClientsClient({ clients: initialClients, loans }: Props) {
  const [clients, setClients] = useState(initialClients)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    first_name: '', last_name: '', nickname: '', sex: '', document_type: 'cedula',
    document: '', phone: '', whatsapp: '', phone_alt: '', email: '',
    provincia: '', municipio: '', sector: '', calle: '', numero: '', referencia: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const filtered = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = !search || 
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search) ||
        c.document?.includes(search)
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
        action={<Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button>}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, teléfono o documento..." className="flex-1" />
        <div className="flex gap-1">
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
          title="No hay clientes"
          description="Agrega tu primer cliente para empezar."
          action={<Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start gap-3">
                  <Avatar name={client.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground truncate">{client.name}</h3>
                      <Badge variant={client.status === 'active' ? 'active' : 'cancelled'}>
                        {getStatusLabel(client.status)}
                      </Badge>
                    </div>
                    {client.phone && <p className="text-xs text-muted-foreground mt-0.5">{client.phone}</p>}
                    {client.document && <p className="text-xs text-muted-foreground">{client.document}</p>}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTrustLevelColor(client.trust_level)}`}>
                    {getStatusLabel(client.trust_level)}
                  </span>
                  <span className="text-xs text-muted-foreground">{client.active_loans} préstamos</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={client.trust_score} variant={client.trust_level === 'high' ? 'green' : client.trust_level === 'medium' ? 'yellow' : 'red'} className="flex-1" />
                  <span className="text-xs text-muted-foreground">{client.trust_score}%</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground flex justify-between">
                  <span>Prestado: {formatCurrency(client.total_borrowed)}</span>
                  <span>Saldo: {formatCurrency(client.balance)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nuevo cliente" className="max-w-lg">
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
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button type="submit" loading={loading}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
