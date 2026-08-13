'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase-client'
import { formatDateFull } from '@/lib/utils'
import { MagnifyingGlass, Scroll } from '@phosphor-icons/react'
import { ACTION_LABELS, ENTITY_LABELS, entityOptions, actionInfo, detailsSummary } from '@/lib/audit-ui'

interface AuditLog {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export default function AuditLogsContent({ showHeader = true }: { showHeader?: boolean }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      setLogs((data || []) as AuditLog[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const entityOptionsList = entityOptions()
  const actionOptions = Object.keys(ACTION_LABELS)

  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    if (q && !actionInfo(l.action).label.toLowerCase().includes(q) && !ENTITY_LABELS[l.entity_type]?.toLowerCase().includes(q)) return false
    if (actionFilter && l.action !== actionFilter) return false
    if (entityFilter && l.entity_type !== entityFilter) return false
    return true
  })

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por acción o entidad..."
            className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11"
          />
        </div>
        <Select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          options={[{ value: '', label: 'Toda acción' }, ...actionOptions.map(a => ({ value: a, label: ACTION_LABELS[a].label }))]}
        />
        <Select
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
          options={[{ value: '', label: 'Toda entidad' }, ...entityOptionsList]}
        />
        {(search || actionFilter || entityFilter) && (
          <button
            onClick={() => { setSearch(''); setActionFilter(''); setEntityFilter('') }}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground min-h-11"
          >
            Limpiar
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando auditoría...</div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <Scroll className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Sin eventos de auditoría.</p>
        </Card>
      ) : (
        <Card className="p-0 sm:p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Entidad</th>
                <th className="px-4 py-3 font-medium">Detalle</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const info = actionInfo(l.action)
                return (
                  <tr key={l.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={info.variant}>{info.label}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ENTITY_LABELS[l.entity_type] || l.entity_type || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{detailsSummary(l.entity_type, l.details) || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateFull(l.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}