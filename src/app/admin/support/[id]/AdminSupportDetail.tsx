'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase-client'
import { uploadFile, getFilePath } from '@/lib/storage'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, PaperPlaneTilt, ImageSquare, X, Check } from '@phosphor-icons/react'

interface Ticket {
  id: string
  subject: string
  body: string
  status: 'open' | 'replied' | 'closed'
  priority: 'low' | 'normal' | 'high'
  attachments?: Attachment[]
  created_at: string
  user_id: string
  author_name: string | null
}

interface Attachment {
  path: string
  name: string
  mime_type?: string
  size?: number
}

interface Message {
  id: string
  body: string
  is_staff: boolean
  attachments: Attachment[]
  created_at: string
}

const STATUS_BADGE: Record<Ticket['status'], { variant: 'active' | 'success' | 'default'; label: string }> = {
  open: { variant: 'active', label: 'Abierto' },
  replied: { variant: 'success', label: 'Respondido' },
  closed: { variant: 'default', label: 'Cerrado' },
}

export default function AdminSupportDetail({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/support/${ticketId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      if (data.ticket) setTicket(data.ticket)
      setMessages(data.messages || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setLoading(false)
  }, [ticketId])

  useEffect(() => { load() }, [load])

  function flashMsg(m: string) {
    setMessage(m)
    setTimeout(() => setMessage(''), 4000)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() && files.length === 0) return
    setSending(true)
    setError('')
    try {
      const attachments: Attachment[] = []
      for (const file of files) {
        const path = getFilePath('support', ticketId, file.name)
        const url = await uploadFile('documents', path, file)
        if (url) attachments.push({ path, name: file.name, mime_type: file.type, size: file.size })
      }
      const res = await fetch(`/api/admin/support/${ticketId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim(), attachments }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al responder')
      setText('')
      setFiles([])
      flashMsg('Respuesta enviada')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al responder')
    }
    setSending(false)
  }

  async function setStatus(status: 'open' | 'closed') {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ticketId, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      flashMsg(status === 'closed' ? 'Ticket cerrado' : 'Ticket reabierto')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setSaving(false)
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>

  if (!ticket) {
    return (
      <Card className="text-center py-12">
        <p className="text-sm text-muted-foreground">Ticket no encontrado.</p>
        <Button variant="secondary" className="mt-3" onClick={() => router.push('/admin/support')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
      </Card>
    )
  }

  const st = STATUS_BADGE[ticket.status]

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.push('/admin/support')}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground min-h-11"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Bandeja de soporte
      </button>

      <Card>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{ticket.subject}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {ticket.author_name || 'Usuario'} · Creado {formatDate(ticket.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={st.variant}>{st.label}</Badge>
            {ticket.status === 'closed' ? (
              <Button size="sm" variant="secondary" onClick={() => setStatus('open')} loading={saving}>
                <Check className="h-4 w-4 mr-1" /> Reabrir
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setStatus('closed')} loading={saving}>
                <Check className="h-4 w-4 mr-1" /> Cerrar
              </Button>
            )}
          </div>
        </div>
      </Card>

      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="space-y-4">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">
            {(ticket.author_name || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{ticket.author_name || 'Cliente'}</p>
            <p className="text-sm text-foreground mt-1">{ticket.body}</p>
            {(ticket.attachments || []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(ticket.attachments || []).map((a, i) => (
                  <button
                    key={i}
                    onClick={async () => {
                      const { data } = await supabase.storage.from('documents').createSignedUrl(a.path, 60)
                      if (data) window.open(data.signedUrl, '_blank')
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    <ImageSquare className="h-3.5 w-3.5" /> {a.name}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{formatDate(ticket.created_at)}</p>
          </div>
        </div>

        {messages.map(m => (
          <div key={m.id} className={`flex gap-3 ${m.is_staff ? 'flex-row-reverse' : ''}`}>
            <div className={`min-w-0 max-w-[85%] ${m.is_staff ? '' : 'text-right'}`}>
              <div className={`inline-block rounded-xl px-4 py-2.5 text-sm text-left ${
                m.is_staff ? 'bg-primary/10 text-foreground' : 'bg-muted text-foreground'
              }`}>
                {m.is_staff && <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">Soporte</p>}
                <p>{m.body}</p>
                {m.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((a, i) => (
                      <button
                        key={i}
                        onClick={async () => {
                          const { data } = await supabase.storage.from('documents').createSignedUrl(a.path, 60)
                          if (data) window.open(data.signedUrl, '_blank')
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-primary"
                      >
                        <ImageSquare className="h-3.5 w-3.5" /> {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{formatDate(m.created_at)}</p>
            </div>
          </div>
        ))}
      </Card>

      {ticket.status !== 'closed' && (
        <Card>
          <form onSubmit={handleSend} className="space-y-3">
            <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Responder al cliente..." rows={4} />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
                    <ImageSquare className="h-4 w-4" /> {f.name}
                    <button type="button" onClick={() => setFiles(fs => fs.filter((_, x) => x !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1 min-h-11 rounded-lg border border-border cursor-pointer px-3 py-2 text-sm text-muted-foreground hover:text-primary hover:border-primary">
                <ImageSquare className="h-4 w-4" />
                <span className="text-xs">Adjuntar</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={e => {
                    const sel = Array.from(e.target.files || [])
                    setFiles(fs => [...fs, ...sel])
                    e.target.value = ''
                  }}
                />
              </label>
              <Button type="submit" loading={sending}>
                <PaperPlaneTilt className="h-4 w-4 mr-1" /> Responder
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}