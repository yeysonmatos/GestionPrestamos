import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditEventInput {
  userId: string
  action: string
  entityType: string
  entityId?: string | null
  details?: Record<string, unknown>
}

// Claves sensibles que nunca deben persistirse en audit_logs.details
// (cédula, GPS, direcciones, teléfonos, referencias de garantía).
export const REDACTED_AUDIT_KEYS = [
  'document', 'document_type', 'gps_lat', 'gps_lng', 'phone', 'phone_alt',
  'whatsapp', 'address', 'provincia', 'municipio', 'sector', 'calle', 'numero',
  'referencia', 'references', 'monthly_income',
]

export function sanitizeAuditDetails(details?: Record<string, unknown> | null): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  if (!details || typeof details !== 'object') return safe
  for (const [key, value] of Object.entries(details)) {
    const lower = key.toLowerCase()
    if (REDACTED_AUDIT_KEYS.includes(lower) || lower.startsWith('gps')) continue
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      safe[key] = sanitizeAuditDetails(value as Record<string, unknown>)
    } else {
      safe[key] = value
    }
  }
  return safe
}

export async function logAuditEvent(supabase: SupabaseClient, input: AuditEventInput): Promise<void> {
  const { userId, action, entityType, entityId, details } = input
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    details: sanitizeAuditDetails(details),
  })
}
