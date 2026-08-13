import type { SupabaseClient } from '@supabase/supabase-js'
import { sendViaSmtp } from './smtp'

export interface EnqueueEmailInput {
  recipientType: 'admin' | 'prestamista'
  recipientUserId?: string | null
  recipientEmail: string
  recipientName?: string | null
  templateKey: string
  subject: string
  htmlBody: string
  eventType: string
  entityType?: string | null
  entityId?: string | null
  dedupeKey?: string | null
}

// Backoff de reintentos: intento 1→10min, 2→1h, 3→6h (y siguientes 24h)
export function retryDelayMs(attempts: number): number {
  if (attempts <= 1) return 10 * 60 * 1000
  if (attempts === 2) return 60 * 60 * 1000
  if (attempts === 3) return 6 * 60 * 60 * 1000
  return 24 * 60 * 60 * 1000
}

// Encola un mensaje (nunca lanza). Devuelve null si falla el insert.
export async function enqueueEmail(admin: SupabaseClient, input: EnqueueEmailInput): Promise<string | null> {
  const { data, error } = await admin
    .from('email_messages')
    .insert({
      recipient_type: input.recipientType,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_email: input.recipientEmail,
      recipient_name: input.recipientName ?? null,
      template_key: input.templateKey,
      subject: input.subject,
      html_body: input.htmlBody,
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      event_type: input.eventType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      dedupe_key: input.dedupeKey ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[notify/queue] enqueue error:', error.message)
    return null
  }
  return data.id as string
}

// Intenta enviar un mensaje una vez. Actualiza estado/attempts/next_retry_at.
async function attemptSend(admin: SupabaseClient, id: string): Promise<void> {
  const { data: row, error } = await admin.from('email_messages').select('*').eq('id', id).maybeSingle()
  if (error || !row) return
  if (row.status === 'sent' || row.status === 'failed') return

  await admin.from('email_messages').update({ status: 'sending' }).eq('id', id)

  const result = await sendViaSmtp(admin, {
    to: row.recipient_email,
    subject: row.subject,
    html: row.html_body,
  })

  if (result.ok) {
    await admin.from('email_messages').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', id)
    return
  }

  const attempts = (row.attempts || 0) + 1
  const patch: Record<string, unknown> = { attempts, last_error: result.error }

  if (attempts >= (row.max_attempts || 3)) {
    patch.status = 'failed'
    patch.next_retry_at = null
  } else {
    patch.status = 'queued'
    patch.next_retry_at = new Date(Date.now() + retryDelayMs(attempts)).toISOString()
  }

  const { error: upErr } = await admin.from('email_messages').update(patch).eq('id', id)
  if (upErr) console.error('[notify/queue] update error:', upErr.message)
}

// Encola + dispara un envío inmediato en segundo plano (fire-and-forget).
export async function enqueueAndSend(admin: SupabaseClient, input: EnqueueEmailInput): Promise<string | null> {
  const id = await enqueueEmail(admin, input)
  if (id) {
    attemptSend(admin, id).catch(err => console.error('[notify/queue] attemptSend:', err))
  }
  return id
}

// Procesa la cola: todos los 'queued' con next_retry_at <= ahora (o null).
export async function flushQueue(admin: SupabaseClient, max: number = 50): Promise<{ sent: number; failed: number; done: number }> {
  const now = new Date().toISOString()
  const { data: rows, error } = await admin
    .from('email_messages')
    .select('id')
    .in('status', ['queued', 'sending'])
    .lte('next_retry_at', now)
    .order('created_at', { ascending: true })
    .limit(max)

  if (error || !rows || rows.length === 0) return { sent: 0, failed: 0, done: 0 }

  const out = { sent: 0, failed: 0, done: 0 }
  for (const row of rows) {
    const before = await admin.from('email_messages').select('status').eq('id', row.id).maybeSingle()
    if (before?.data?.status !== 'sent' && before?.data?.status !== 'failed') {
      await attemptSend(admin, row.id)
    }
  }
  const after = await admin.from('email_messages').select('status').in('id', rows.map(r => r.id))
  const statuses = after.data || []
  out.sent = statuses.filter(r => r.status === 'sent').length
  out.failed = statuses.filter(r => r.status === 'failed').length
  out.done = statuses.length
  return out
}

// Re-encola mensajes fallidos (el admin los puede reprocesar con un click).
export async function retryFailed(admin: SupabaseClient, ids?: string[]): Promise<number> {
  let query = admin.from('email_messages').select('id').eq('status', 'failed')
  if (ids && ids.length) query = query.in('id', ids)
  const { data: rows, error } = await query
  if (error || !rows) return 0
  await admin.from('email_messages')
    .update({ status: 'queued', attempts: 0, next_retry_at: null })
    .in('id', rows.map(r => r.id))
  return rows.length
}

// Devuelve true si ya existe un mensaje con esa dedupe_key (evita duplicados del cron).
export async function existsByDedupe(admin: SupabaseClient, dedupeKey: string): Promise<boolean> {
  const { data, error } = await admin
    .from('email_messages')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .limit(1)
    .maybeSingle()
  if (error) return false
  return !!data
}