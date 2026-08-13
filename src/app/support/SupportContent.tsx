'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input, { Select, Textarea } from '@/components/ui/Input'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase-client'
import { logAuditEvent } from '@/lib/audit'
import { uploadFile, getFilePath } from '@/lib/storage'
import { formatDate } from '@/lib/utils'
import { Plus, ChatCircle, MagnifyingGlass, ImageSquare, X } from '@phosphor-icons/react'

interface Ticket {
  id: string
  subject: string
  body: string
  status: 'open' | 'replied' | 'closed'
  priority: 'low' | 'normal' | 'high'
  created_at: string
  updated_at: string
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

export default function SupportContent({ showHeader = true }: { showHeader?: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const supabase = createClient()

  const [form, setForm] = useState({ subject: '', body: '', priority: 'normal' })
  const [files, setFiles] = useState<File[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      setTickets((data || []) as Ticket[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function flashMsg(m: string) {
    setMessage(m)
    setTimeout(() => setMessage(''), 4000)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subject.trim() || !form.body.trim()) {
      setError('Asunto y mensaje son requeridos')
      return
    }
    setCreating(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('No autenticado. Inicia sesión para crear un ticket.')
        setCreating(false)
        return
      }
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: user.id,
          subject: form.subject.trim(),
          body: form.body.trim(),
          priority: form.priority,
        })
        .select()
        .single()
      if (error) throw error
      const ticket = data as Ticket

      logAuditEvent(supabase, { userId: user.id, action: 'ticket.created', entityType: 'support_ticket', entityId: ticket.id, details: { subject: ticket.subject } })

      // Subir capturas adjuntas y asociarlas al ticket
      if (files.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        const attachments: { path: string; name: string; mime_type?: string; size?: number }[] = []
        for (const file of files) {
          const path = getFilePath('support', ticket.id, file.name)
          const url = await uploadFile('documents', path, file)
          if (url) attachments.push({ path, name: file.name, mime_type: file.type, size: file.size })
        }
        if (attachments.length > 0) {
          const { error: upErr } = await supabase.from('support_tickets').update({ attachments }).eq('id', ticket.id)
          if (upErr) console.error('No se pudieron guardar adjuntos del ticket:', upErr.message)
        }
      }

      fetch('/api/support/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'new_ticket', ticketId: ticket.id }),
      }).catch(() => {})
      flashMsg('Ticket creado. Te responderemos pronto.')
      setShowNew(false)
      setForm({ subject: '', body: '', priority: 'normal' })
      setFiles([])
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    }
    setCreating(false)
  }

  const filtered = tickets.filter(t =>
    t.subject.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {showHeader && (
        <PageHeader
          title="Soporte"
          description="Crea tickets y da seguimiento a tus solicitudes"
        />
      )}

      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por asunto..."
            className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11"
          />
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo ticket
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando tickets...</div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <ChatCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aún no hay tickets. Crea uno para comenzar.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const st = STATUS_BADGE[t.status]
            const pr = PRIORITY_BADGE[t.priority]
            return (
              <Link key={t.id} href={`/support/${t.id}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{t.subject}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
                      <p className="text-xs text-muted-foreground mt-2">Actualizado {formatDate(t.updated_at)}</p>
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

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Nuevo ticket">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Asunto"
            value={form.subject}
            onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
            placeholder="Describe el problema en una frase"
            required
          />
          <Select
            label="Prioridad"
            value={form.priority}
            onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
            options={[
              { value: 'low', label: 'Baja' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'Alta' },
            ]}
          />
          <Textarea
            label="Mensaje"
            value={form.body}
            onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
            placeholder="Cuéntanos con detalle qué necesitas..."
            rows={5}
            required
          />
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
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1 min-h-11 rounded-lg border border-border cursor-pointer px-3 py-2 text-sm text-muted-foreground hover:text-primary hover:border-primary">
              <ImageSquare className="h-4 w-4" />
              <span className="text-xs">Adjuntar captura</span>
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
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button type="submit" loading={creating}>
                <Plus className="h-4 w-4 mr-1" /> Crear ticket
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}