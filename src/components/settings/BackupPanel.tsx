'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDate, formatNumber } from '@/lib/utils'
import { CloudArrowUp, CloudArrowDown, ClockCounterClockwise, Check } from '@phosphor-icons/react'

interface BackupItem {
  folder: string
  timestamp: string
  tables: number
  count: number
  createdAt: string
}

export default function BackupPanel() {
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const loadBackups = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/backup/list')
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch { data = {} }
      if (res.ok) setBackups(data.backups || [])
      else setError(data.error || `Error ${res.status}: ${text.slice(0, 200)}`)
    } catch {
      setError('Error de conexión')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadBackups() }, [loadBackups])

  async function generateBackup() {
    setGenerating(true)
    setStatus('')
    setError('')
    try {
      const res = await fetch('/api/backup/generate', { method: 'POST' })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch { data = {} }
      if (res.ok) {
        setStatus(`Backup creado: ${formatNumber(data.count)} registros en ${data.tables.length} tablas`)
        loadBackups()
      } else {
        setError(data.error || `Error ${res.status}: ${text.slice(0, 200)}`)
      }
    } catch {
      setError('Error de conexión')
    }
    setGenerating(false)
  }

  async function restoreBackup(folder: string, timestamp: string) {
    if (!confirm(`¿Restaurar backup del ${formatTimestamp(timestamp)}?\n\nSe reemplazarán TODOS tus datos actuales por los del backup. Esta acción NO se puede deshacer.`)) return

    setRestoring(true)
    setStatus('')
    setError('')
    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch { data = {} }
      if (res.ok) {
        setStatus(`Restaurados ${formatNumber(data.count)} registros en ${data.tables.length} tablas`)
        loadBackups()
      } else {
        setError(data.error || `Error ${res.status}: ${text.slice(0, 200)}`)
      }
    } catch {
      setError('Error de conexión')
    }
    setRestoring(false)
  }

  function formatTimestamp(ts: string): string {
    try {
      const parts = ts.split('_')
      if (parts.length !== 2) return ts
      const datePart = parts[0].replace(/-/g, '/')
      const timePart = parts[1].replace(/-/g, ':')
      return `${datePart} ${timePart}`
    } catch {
      return ts
    }
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Backup de datos</h3>
            <p className="text-sm text-muted-foreground">Exporta todos tus datos o restaura desde un backup anterior</p>
          </div>
          <Button onClick={generateBackup} loading={generating}>
            <CloudArrowUp className="h-4 w-4 mr-1" /> Generar backup
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>
        )}
        {status && (
          <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">{status}</div>
        )}
        {restoring && (
          <div className="bg-amber-50 text-amber-700 text-sm p-3 rounded-lg flex items-center gap-2">
            <span className="animate-spin h-4 w-4 border-2 border-amber-700 border-t-transparent rounded-full" />
            Restaurando datos... No cierres la página.
          </div>
        )}

        {loading ? (
          <div className="text-center py-6 text-sm text-muted-foreground">Cargando backups...</div>
        ) : backups.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <ClockCounterClockwise className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground">Sin backups</p>
            <p className="text-sm text-muted-foreground mt-1">Genera tu primer backup con el botón superior</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map(b => (
              <div key={b.folder} className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/30 transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">{formatTimestamp(b.timestamp)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(b.count)} registros · {b.tables} tablas
                      {b.createdAt && <> · {formatDate(b.createdAt)}</>}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => restoreBackup(b.folder, b.timestamp)}
                  loading={restoring}
                >
                  <CloudArrowDown className="h-4 w-4 mr-1" /> Restaurar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
