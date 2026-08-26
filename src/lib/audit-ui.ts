'use client'

export type BadgeVariant = 'active' | 'paid' | 'cancelled' | 'default' | 'late' | 'success'

export interface ActionLabel {
  label: string
  variant: BadgeVariant
}

export const ACTION_LABELS: Record<string, ActionLabel> = {
  'loan.liquidated': { label: 'Préstamo liquidado', variant: 'success' },
  'payment.reversed': { label: 'Pago revertido', variant: 'cancelled' },
  'capital_abono': { label: 'Abono a capital', variant: 'active' },
  'payment.recorded': { label: 'Pago registrado', variant: 'paid' },
  'loan.paid': { label: 'Cuota pagada', variant: 'paid' },
  'client.created': { label: 'Cliente creado', variant: 'paid' },
  'client.updated': { label: 'Cliente actualizado', variant: 'active' },
  'client.deleted': { label: 'Cliente eliminado', variant: 'cancelled' },
  'loan.created': { label: 'Préstamo creado', variant: 'paid' },
  'loan.updated': { label: 'Préstamo actualizado', variant: 'active' },
  'loan.deleted': { label: 'Préstamo eliminado', variant: 'cancelled' },
  'settings.updated': { label: 'Configuración actualizada', variant: 'default' },
  'backup.generated': { label: 'Backup creado', variant: 'success' },
  'backup.restored': { label: 'Backup restaurado', variant: 'cancelled' },
  'ticket.created': { label: 'Solicitud de soporte', variant: 'active' },
  'subscription.paid': { label: 'Pago de suscripción', variant: 'paid' },
  'subscription.upgraded': { label: 'Cambio de plan', variant: 'active' },
  'subscription.rejected': { label: 'Pago de suscripción rechazado', variant: 'cancelled' },
}

export const ENTITY_LABELS: Record<string, string> = {
  loan: 'Préstamo',
  client: 'Cliente',
  payment: 'Pago',
  settings: 'Configuración',
  backup: 'Backup',
  support_ticket: 'Ticket',
  ticket: 'Ticket',
  subscription_payment: 'Pago suscripción',
}

export function entityOptions(): { value: string; label: string }[] {
  const seen = new Set<string>()
  const out: { value: string; label: string }[] = []
  for (const key of Object.keys(ENTITY_LABELS)) {
    const label = ENTITY_LABELS[key]
    if (seen.has(label)) continue
    seen.add(label)
    out.push({ value: key, label })
  }
  return out
}

export function actionInfo(action: string): ActionLabel {
  return ACTION_LABELS[action] || { label: action.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase()), variant: 'default' }
}

const SETTINGS_LABELS: Record<string, string> = {
  business_name: 'Negocio',
  business_phone: 'Teléfono',
  business_email: 'Email',
  business_address: 'Dirección',
  personal_name: 'Nombre',
  personal_phone: 'Teléfono',
  personal_email: 'Email',
  currency: 'Moneda',
  late_interest_rate: 'Mora diaria',
  loan_id_prefix: 'Prefijo de ID',
  grace_days: 'Días de gracia',
  notify_upcoming_days: 'Aviso de vencimiento',
  default_installments: 'Cuotas por defecto',
  default_frequency: 'Frecuencia',
  country: 'País',
  timezone: 'Zona horaria',
}

const AMORT_LABELS: Record<string, string> = {
  french: 'Cuotas Fijas',
  interest_only: 'Solo Interés',
  'interest-only': 'Solo Interés',
}

const LOAN_LABELS: Record<string, string> = {
  amount: 'Monto',
  interest_rate: 'Tasa',
  interest_type: 'Tipo interés',
  installments: 'N° cuotas',
  frequency: 'Frecuencia',
  amortization_type: 'Tipo',
  open_ended: 'Abierto',
  payment_day: 'Día de pago',
  start_date: 'Inicio',
  first_payment_date: '1er pago',
  total_amount: 'Total',
  total_interest: 'Interés total',
  remaining_amount: 'Pendiente',
  installment_amount: 'Cuota',
  guarantee: 'Garantía',
  notes: 'Notas',
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
}

const KNOWN_KEYS = new Set([
  'reason', 'folder', 'count', 'tables', '__previous', 'type',
  'name', 'loan_id', 'client_id', 'client_name', 'installment_id', 'amount', 'subject', 'plan', 'days', 'payment_method', 'method',
  'capital_amount', 'interest_amount', 'late_amount',
  ...Object.keys(SETTINGS_LABELS),
  ...Object.keys(LOAN_LABELS),
])

function formatMoney(v: unknown): string {
  if (v == null || v === '' || isNaN(Number(v))) return ''
  return `RD$${Number(v).toLocaleString('es-DO', { maximumFractionDigits: 0 })}`
}

function formatYesNo(v: unknown): string {
  return v === true || v === 'true' ? 'sí' : 'no'
}

function prettyTimestamp(folder: unknown): string {
  if (typeof folder !== 'string') return ''
  const m = folder.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/)
  if (!m) return ''
  return `${m[1].split('-').reverse().join('/')} ${m[2]}:${m[3]}`
}

export function detailsSummary(entityType: string, details?: Record<string, unknown>): string {
  if (!details) return ''
  const parts: string[] = []

  // Backups: "hoy 12:51 — 107 registros en 5 tablas"
  if (entityType === 'backup') {
    const ts = prettyTimestamp(details.folder)
    if (ts) parts.push(ts)
    if (details.count != null) parts.push(`${details.count} registros`)
    if (Array.isArray(details.tables) && details.tables.length > 0) {
      parts.push(`en ${details.tables.length} tablas`)
    } else if (details.tables) {
      parts.push(`en ${String(details.tables).split(',').length} tablas`)
    }
    return parts.join(' · ')
  }

  // Pagos (registro / reversión / abono)
  if (entityType === 'payment') {
    if (details.client_name && typeof details.client_name === 'string') parts.push(`Cliente: ${details.client_name}`)
    if (details.loan_id && typeof details.loan_id === 'string') parts.push(`N°: ${details.loan_id}`)
    const amount = formatMoney(details.amount)
    if (amount) parts.push(amount)
    if (entityType === 'payment' && details.late_amount != null && Number(details.late_amount) > 0) {
      parts.push(`mora ${formatMoney(details.late_amount)}`)
    }
    if (details.reason && typeof details.reason === 'string') parts.push(`Motivo: ${details.reason}`)
    if (details.subject && typeof details.subject === 'string') parts.push(`Asunto: ${details.subject}`)
    return parts.join(' · ')
  }

  // Suscripción (pago / cambio de plan)
  if (entityType === 'subscription_payment') {
    const amount = formatMoney(details.amount)
    if (amount) parts.push(amount)
    if (details.plan && typeof details.plan === 'string') parts.push(`Plan: ${details.plan}`)
    if (details.days != null) parts.push(`${details.days} días`)
    if (details.reason && typeof details.reason === 'string') parts.push(`Motivo: ${details.reason}`)
    return parts.join(' · ')
  }

  if (details.name && typeof details.name === 'string' && entityType !== 'loan') parts.push(details.name)
  if (details.client_name && typeof details.client_name === 'string') parts.push(`Cliente: ${details.client_name}`)
  if (entityType === 'loan' && details.loan_id && typeof details.loan_id === 'string') parts.push(`N°: ${details.loan_id}`)
  if (details.reason && typeof details.reason === 'string' && entityType !== 'payment') parts.push(`Motivo: ${details.reason}`)
  if (details.subject && typeof details.subject === 'string') parts.push(`Asunto: ${details.subject}`)

  const prevMap = (details.__previous && typeof details.__previous === 'object') ? details.__previous as Record<string, unknown> : null

  function fmtRawVal(k: string, v: unknown): string {
    let val = String(v)
    if (k === 'amount' || k === 'total_amount' || k === 'total_interest' || k === 'remaining_amount' || k === 'installment_amount' || k === 'capital_amount' || k === 'interest_amount' || k === 'late_amount') {
      return formatMoney(v)
    }
    if (k === 'open_ended') return formatYesNo(v)
    if (k === 'amortization_type' && AMORT_LABELS[val]) val = AMORT_LABELS[val]
    if (k === 'frequency' && FREQ_LABELS[val]) val = FREQ_LABELS[val]
    if (k === 'start_date' || k === 'first_payment_date') return val
    if (k === 'late_interest_rate') return `${Number(v) || 0}%`
    return val
  }

  function fmtVal(label: string, k: string, v: unknown): string {
    return `${label}: ${fmtRawVal(k, v)}`
  }

  if (entityType === 'loan') {
    const loanChanges = Object.keys(LOAN_LABELS)
      .filter(k => details[k] != null && details[k] !== '')
      .map(k => {
        const old = prevMap && prevMap[k] != null && prevMap[k] !== '' ? String(prevMap[k]) : null
        if (old !== null) {
          return `${LOAN_LABELS[k]}: ${fmtRawVal(k, old)} → ${fmtRawVal(k, details[k])}`
        }
        return fmtVal(LOAN_LABELS[k], k, details[k])
      })
    parts.push(...loanChanges.slice(0, 5))
    if (loanChanges.length > 5) parts.push(`+${loanChanges.length - 5} más`)
    return parts.join(' · ')
  }

  const settingsParts = Object.keys(SETTINGS_LABELS)
    .filter(k => details[k] != null && details[k] !== '')
    .map(k => {
      const old = prevMap && prevMap[k] != null && prevMap[k] !== '' ? String(prevMap[k]) : null
      if (old !== null) {
        return `${SETTINGS_LABELS[k]}: ${fmtRawVal(k, old)} → ${fmtRawVal(k, details[k])}`
      }
      return `${SETTINGS_LABELS[k]}: ${fmtRawVal(k, details[k])}`
    })
  parts.push(...settingsParts.slice(0, 4))
  if (settingsParts.length > 4) parts.push(`+${settingsParts.length - 4} más`)
  const extra = Object.keys(details)
    .filter(k => !KNOWN_KEYS.has(k) && details[k] != null && details[k] !== '')
    .slice(0, 3)
    .map(k => `${k}: ${details[k]}`)
  parts.push(...extra)
  if (Object.keys(details).filter(k => !KNOWN_KEYS.has(k) && details[k] != null && details[k] !== '').length > 3) parts.push('+más')
  return parts.join(' · ')
}
