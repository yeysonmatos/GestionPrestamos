'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { Envelope, ArrowClockwise, MagnifyingGlass } from '@phosphor-icons/react'

interface EmailMessage {
  id: string
  recipient_type: 'admin' | 'prestamista'
  recipient_name?: string | null
  recipient_email: string
  template_key: string
  subject: string
  html_body: string
  status: 'queued' | 'sending' | 'sent' | 'failed'
  attempts: number
  max_attempts: number
  last_error?: string | null
  event_type: string
  entity_type?: string | null
  entity_id?: string | null
  created_at: string
  sent_at?: string | null
}

const STATUS_STYLE: Record<EmailMessage['status'], { variant: 'active' | 'success' | 'default' | 'cancelled'; label: string }> = {
  queued: { variant: 'active', label: 'En cola' },
  sending: { variant: 'active', label: 'Enviando' },
  sent: { variant: 'success', label: 'Enviado' },
  failed: { variant: 'cancelled', label: 'Fallido' },
}

export default function AdminEmails() {
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<EmailMessage | null>(null)
  const [retrying, setRetrying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/emails?${params.toString()}`, { credentials: 'include' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al cargar')
      setMessages(d.messages || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    }
    setLoading(false)
  }, [status, q])

  useEffect(() => { load() }, [load])

  function flashMsg(m: string) {
    setMessage(m)
    setTimeout(() => setMessage(''), 4000)
  }

  async function handleRetry() {
    setRetrying(true)
    setError('')
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error')
      flashMsg(`${d.requeued} correos fallidos reenviados a la cola`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setRetrying(false)
  }

  const failedCount = messages.filter(m => m.status === 'failed').length

  return (
    <div className="space-y-4">
      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar por correo, nombre o asunto..."
              className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11"
            />
          </div>
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            {['', 'queued', 'sent', 'failed'].map(s => (
              <button
                key={s || 'all'}
                onClick={() => setStatus(s)}
                className={`px-3 py-2 text-xs font-medium min-h-11 ${status === s ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground bg-card'}`}
              >
                {s === '' ? 'Todos' : s === 'queued' ? 'En cola' : s === 'sent' ? 'Enviados' : 'Fallidos'}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={handleRetry} loading={retrying} disabled={failedCount === 0}>
            <ArrowClockwise className="h-4 w-4 mr-1" /> Reenviar fallidos ({failedCount})
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando correos...</div>
      ) : messages.length === 0 ? (
        <Card className="text-center py-12">
          <Envelope className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No hay correos registrados todavía.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {messages.map(m => {
            const st = STATUS_STYLE[m.status]
            return (
              <button
                key={m.id}
                onClick={() => setPreview(m)}
                className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Para {m.recipient_name || m.recipient_email} · {formatDate(m.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.attempts > 0 && m.status !== 'sent' && (
                      <span className="text-[10px] text-muted-foreground">Intento {m.attempts}/{m.max_attempts}</span>
                    )}
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                </div>
                {m.status === 'failed' && m.last_error && (
                  <p className="text-xs text-destructive mt-1 truncate">{m.last_error}</p>
                )}
              </button>
            )
          })}
        </Card>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.subject || 'Correo'}>
        {preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={STATUS_STYLE[preview.status].variant}>{STATUS_STYLE[preview.status].label}</Badge>
              <span className="text-xs text-muted-foreground">
                Para {preview.recipient_name || preview.recipient_email} · {formatDate(preview.created_at)}
              </span>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <iframe title="preview" srcDoc={preview.html_body} className="w-full h-[420px] bg-white" />
            </div>
            <p className="text-xs text-muted-foreground">
              Evento: {preview.event_type} · Plantilla: {preview.template_key}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}