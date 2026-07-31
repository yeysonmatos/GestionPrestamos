import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditEventInput {
  userId: string
  action: string
  entityType: string
  entityId?: string | null
  details?: Record<string, unknown>
}

export async function logAuditEvent(supabase: SupabaseClient, input: AuditEventInput): Promise<void> {
  const { userId, action, entityType, entityId, details } = input
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    details: details || {},
  })
}
