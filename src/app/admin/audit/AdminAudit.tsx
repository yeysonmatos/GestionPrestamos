'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import StatCard from '@/components/ui/StatCard'
import { Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { formatDateFull } from '@/lib/utils'
import { ACTION_LABELS, ENTITY_LABELS, entityOptions, actionInfo, detailsSummary } from '@/lib/audit-ui'
import { ClipboardText, MagnifyingGlass, Scroll, HandCoins, CurrencyDollar, ArrowsCounterClockwise, DownloadSimple } from '@phosphor-icons/react'

interface AuditEntry {
  id: string
  user_id: string
  user_name: string
  role: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

const PAGE_SIZE = 50

export default function AdminAudit() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [users, setUsers] = useState<{ id: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(d => {
      if (d.users) setUsers((d.users as { id: string; display_name: string }[]).map(u => ({ id: u.id, label: u.display_name })))
    }).catch(() => {})
  }, [])

  const load = useCallback(async (reset = true) => {
    setError('')
    if (reset) { setLoading(true); setLogs([]) } else { setLoadingMore(true) }
    try {
      const params = new URLSearchParams()
      if (userFilter) params.set('user', userFilter)
      if (actionFilter) params.set('action', actionFilter)
      if (entityFilter) params.set('entity', entityFilter)
      if (q) params.set('q', q)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      const limit = reset ? PAGE_SIZE : Math.max(PAGE_SIZE, logs.length + PAGE_SIZE)
      params.set('limit', String(limit))
      const res = await fetch(`/api/admin/audit?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar auditoría')
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setLoading(false)
    setLoadingMore(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFilter, actionFilter, entityFilter, q, fromDate, toDate])

  useEffect(() => { load() }, [load])

  const clearFilters = () => {
    setQ(''); setSearchInput(''); setUserFilter(''); setActionFilter(''); setEntityFilter(''); setFromDate(''); setToDate('')
  }

  const stats = useMemo(() => {
    const payments = logs.filter(l => l.action === 'payment.recorded').length
    const reversions = logs.filter(l => l.action === 'payment.reversed').length
    const liquidations = logs.filter(l => l.action === 'loan.liquidated').length
    return { total, payments, reversions, liquidations }
  }, [logs, total])

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Eventos" value={total} icon={ClipboardText} />
        <StatCard label="Pagos" value={stats.payments} icon={HandCoins} />
        <StatCard label="Reversiones" value={stats.reversions} icon={ArrowsCounterClockwise} />
        <StatCard label="Liquidaciones" value={stats.liquidations} icon={CurrencyDollar} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setQ(searchInput.trim()) }}
            placeholder="Buscar por usuario, acción o entidad (Enter)..."
            className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11"
          />
        </div>
        <Select
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
          options={[{ value: '', label: 'Todos los usuarios' }, ...users.map(u => ({ value: u.id, label: u.label }))]}
        />
        <Select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          options={[{ value: '', label: 'Toda acción' }, ...Object.keys(ACTION_LABELS).map(a => ({ value: a, label: ACTION_LABELS[a].label }))]}
        />
        <Select
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
          options={[{ value: '', label: 'Toda entidad' }, ...entityOptions()]}
        />
        <input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {(q || userFilter || actionFilter || entityFilter || fromDate || toDate) && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground min-h-11"
          >
            Limpiar
          </button>
        )}
        <Button variant="ghost" onClick={() => {
          const params = new URLSearchParams()
          if (userFilter) params.set('user_id', userFilter)
          if (fromDate) params.set('from', fromDate)
          if (toDate) params.set('to', toDate)
          window.location.href = `/api/admin/export?type=audit${params.toString() ? `&${params.toString()}` : ''}`
        }}>
          <DownloadSimple className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando auditoría...</div>
      ) : logs.length === 0 ? (
        <Card className="text-center py-12">
          <Scroll className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Sin eventos para los filtros seleccionados.</p>
        </Card>
      ) : (
        <>
          <Card className="p-0 sm:p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Evento</th>
                  <th className="px-4 py-3 font-medium">Entidad</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => {
                  const info = actionInfo(l.action)
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateFull(l.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground">{l.user_name}</span>
                          {l.role === 'admin' && <Badge variant="active">Admin</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={info.variant}>{info.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{ENTITY_LABELS[l.entity_type] || l.entity_type || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{detailsSummary(l.entity_type, l.details) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
          {logs.length < total && (
            <div className="flex justify-center">
              <Button variant="ghost" onClick={() => load(false)} loading={loadingMore}>
                Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
