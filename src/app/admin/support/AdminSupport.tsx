'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { ChatCircle, MagnifyingGlass } from '@phosphor-icons/react'

interface Ticket {
  id: string
  subject: string
  body: string
  status: 'open' | 'replied' | 'closed'
  priority: 'low' | 'normal' | 'high'
  created_at: string
  updated_at: string
  user_id: string
  author_name: string | null
}

const STATUS_BADGE: Record<Ticket['status'], { variant: 'active' | 'success' | 'default'; label: string }> = {
  open: { variant: 'active', label: 'Abierto' },
  replied: { variant: 'success', label: 'Respondido' },
  closed: { variant: 'default', label: 'Cerrado' },
}

const PRIORITY_BADGE: Record<Ticket['priority'], { variant: 'active' | 'cancelled' | 'default'; label: string }> = {
  low: { variant: 'default', label: 'Baja' },
  normal: { variant: 'active', label: 'Normal' },
  high: { variant: 'cancelled', label: 'Alta' },
}

const TABS: { key: '' | 'open' | 'replied' | 'closed'; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'open', label: 'Abiertos' },
  { key: 'replied', label: 'Respondidos' },
  { key: 'closed', label: 'Cerrados' },
]

export default function AdminSupport() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'' | 'open' | 'replied' | 'closed'>('open')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab) params.set('status', tab)
      if (priority) params.set('priority', priority)
      if (q) params.set('q', q)
      if (type) params.set('type', type)
      const qs = params.toString()
      const res = await fetch(`/api/admin/support${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setTickets(data.tickets || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setLoading(false)
  }, [tab, priority, q, type])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-1 items-center">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-11 ${
              tab === t.key ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setQ(searchInput.trim()) }}
            placeholder="Buscar por asunto o usuario (Enter)..."
            className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11"
          />
        </div>
        <Select
          value={priority}
          onChange={e => { setPriority(e.target.value); }}
          options={[{ value: '', label: 'Toda prioridad' }, { value: 'low', label: 'Baja' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Alta' }]}
        />
        <Select
          value={type}
          onChange={e => { setType(e.target.value); }}
          options={[{ value: '', label: 'Todos los tipos' }, { value: 'upgrade_request', label: 'Upgrade de plan' }, { value: 'support', label: 'Soporte general' }]}
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando tickets...</div>
      ) : tickets.length === 0 ? (
        <Card className="text-center py-12">
          <ChatCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No hay tickets en esta vista.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => {
            const st = STATUS_BADGE[t.status]
            const pr = PRIORITY_BADGE[t.priority]
            return (
              <Link key={t.id} href={`/admin/support/${t.id}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{t.subject}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t.author_name || 'Usuario'} · {formatDate(t.updated_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <Badge variant={pr.variant}>{pr.label}</Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}