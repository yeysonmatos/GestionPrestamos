// Plantillas HTML de correo. Cada evento genera un email con un enlace
// que lleva de vuelta a la plataforma (la conversación NO continúa por correo).
// Diseño sobrio y minimalista: nada de gradientes, cards ni botones llamativos,
// porque ese HTML "de marketing" dispara los filtros de spam.

import { formatDateShort } from '@/lib/utils'

export type TemplateKey =
  | 'new_ticket'
  | 'pay_request'
  | 'upgrade_request'
  | 'ticket_replied'
  | 'ticket_closed'
  | 'payment_approved'
  | 'plan_updated'
  | 'plan_expiring'
  | 'trial_expired'

export const TEMPLATE_KEYS: TemplateKey[] = [
  'new_ticket',
  'pay_request',
  'upgrade_request',
  'ticket_replied',
  'ticket_closed',
  'payment_approved',
  'plan_updated',
  'plan_expiring',
  'trial_expired',
]

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://gestordeprestamos.do'
}

function link(link: string, label: string): string {
  return `<a href="${link}" style="color:#2563EB;text-decoration:underline;">${label}</a>`
}

function formattedDate(value: unknown): string {
  const raw = typeof value === 'string' ? value.slice(0, 10) : ''
  const d = new Date(raw)
  if (!raw || isNaN(d.getTime())) return ''
  return formatDateShort(d)
}

function layout(title: string, lines: string[], cta?: { link: string; label: string }, footerNote?: string): string {
  return `
  <div style="background:#ffffff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
    <p style="margin:0 0 16px;font-size:18px;font-weight:bold;">${title}</p>
    ${lines.map(l => `<p style="margin:8px 0;font-size:14px;line-height:1.6;">${l}</p>`).join('')}
    ${cta ? `<p style="margin:16px 0;font-size:14px;">${link(cta.link, cta.label)}</p>` : ''}
    ${footerNote ? `<p style="margin:20px 0 0;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;">${footerNote}</p>` : ''}
    <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">Este es un mensaje automático de Gestor de Prestamos. No respondas a este correo; usa la aplicación.</p>
  </div>`
}

export const templateSubjects: Record<TemplateKey, string> = {
  new_ticket: 'Nuevo ticket de soporte',
  pay_request: 'Solicitud de pago de suscripción',
  upgrade_request: 'Solicitud de cambio de plan',
  ticket_replied: 'Respuesta a tu ticket',
  ticket_closed: 'Tu ticket fue cerrado',
  payment_approved: 'Pago aprobado',
  plan_updated: 'Tu plan fue actualizado',
  plan_expiring: 'Tu suscripción está por vencer',
  trial_expired: 'Prueba vencida: prestamista en modo lectura',
}

export interface RenderTemplate {
  key: TemplateKey
  data: Record<string, unknown>
}

export function renderTemplate({ key, data }: RenderTemplate): { subject: string; html: string } {
  const base = appUrl()
  switch (key) {
    case 'new_ticket':
      return {
        subject: `${templateSubjects.new_ticket}: ${data.subject}`,
        html: layout(
          'Nuevo ticket de soporte',
          [
            `<strong>${data.prestamistaName || data.email}</strong> ha creado un nuevo ticket de soporte.`,
            `<strong>Asunto:</strong> ${data.subject}`,
            `<strong>Prioridad:</strong> ${data.priority || 'normal'}`,
          ],
          { link: `${base}/admin/support`, label: 'Ver bandeja de soporte' },
          'Responde desde tu panel de administración.'
        ),
      }

    case 'pay_request':
      return {
        subject: `${templateSubjects.pay_request}: ${data.prestamistaName || data.email}`,
        html: layout(
          'Solicitud de pago de suscripción',
          [
            `<strong>${data.prestamistaName || data.email}</strong> ha solicitado pagar su suscripción.`,
            data.plan ? `<strong>Plan:</strong> ${data.plan}` : '',
            data.amount ? `<strong>Monto:</strong> ${data.amount}` : '',
          ].filter(Boolean),
          { link: `${base}/admin/payments`, label: 'Revisar solicitud' },
          'Confirma o rechaza la solicitud desde tu panel de administración.'
        ),
      }

    case 'upgrade_request':
      return {
        subject: `${templateSubjects.upgrade_request}: ${data.prestamistaName || data.email}`,
        html: layout(
          'Solicitud de cambio de plan',
          [
            `<strong>${data.prestamistaName || data.email}</strong> desea cambiar de plan.`,
            data.targetPlan ? `<strong>Nuevo plan:</strong> ${data.targetPlan}` : '',
            data.amount ? `<strong>Monto:</strong> ${data.amount}` : '',
          ].filter(Boolean),
          { link: `${base}/admin/users`, label: 'Revisar solicitud' },
          'Aprueba o rechaza la solicitud desde tu panel de administración.'
        ),
      }

    case 'ticket_replied':
      return {
        subject: `${templateSubjects.ticket_replied}: ${data.subject}`,
        html: layout(
          'Tu ticket recibió una respuesta',
          [
            `Tu ticket <strong>${data.subject}</strong> fue respondido por el equipo de soporte.`,
            'Entra a la plataforma para leer la respuesta y seguir la conversación.',
          ],
          { link: `${base}/support/${data.ticketId}`, label: 'Ver respuesta' },
          'La conversación continúa dentro de la sección Soporte de tu cuenta.'
        ),
      }

    case 'ticket_closed':
      return {
        subject: `${templateSubjects.ticket_closed}: ${data.subject}`,
        html: layout(
          'Tu ticket fue cerrado',
          [
            `Tu ticket <strong>${data.subject}</strong> fue marcado como cerrado.`,
            'Si necesitas más ayuda, puedes crear un nuevo ticket en la sección Soporte.',
          ],
          { link: `${base}/support/${data.ticketId}`, label: 'Ver ticket' },
          'Gracias por usar Gestor de Prestamos.'
        ),
      }

    case 'payment_approved':
      return {
        subject: templateSubjects.payment_approved,
        html: layout(
          'Pago aprobado',
          [
            'Tu pago de suscripción fue <strong>aprobado</strong>.',
            data.plan ? `<strong>Plan:</strong> ${data.plan}` : '',
            data.amount ? `<strong>Monto:</strong> ${data.amount}` : '',
            data.endsAt ? `<strong>Válido hasta:</strong> ${formattedDate(data.endsAt)}` : '',
          ].filter(Boolean),
          { link: `${base}/account`, label: 'Ver suscripción' },
          'Consulta el detalle de tu suscripción en la sección Mi plan.'
        ),
      }

    case 'plan_updated':
      return {
        subject: templateSubjects.plan_updated,
        html: layout(
          'Tu plan fue actualizado',
          [
            `Tu plan ahora es <strong>${data.plan}</strong>.`,
            data.endsAt ? `<strong>Válido hasta:</strong> ${formattedDate(data.endsAt)}` : '',
          ].filter(Boolean),
          { link: `${base}/account`, label: 'Ver suscripción' },
          'Todo listo. Tu cuenta quedó actualizada.'
        ),
      }

    case 'plan_expiring':
      return {
        subject: data.expired
          ? 'Tu suscripción a Gestor de Prestamos ha vencido'
          : `${templateSubjects.plan_expiring} (${data.days} día${data.days === 1 ? '' : 's'})`,
        html: layout(
          data.expired ? 'Tu suscripción ha vencido' : 'Tu suscripción está por vencer',
          data.expired
            ? ['Tu suscripción a Gestor de Prestamos ha vencido. Contacta a tu administrador para renovarla.']
            : [
                `Tu plan <strong>${data.plan}</strong> vence en <strong>${data.days} día${data.days === 1 ? '' : 's'}</strong>.`,
                data.endsAt ? `<strong>Fecha de vencimiento:</strong> ${formattedDate(data.endsAt)}` : '',
                'Contacta a tu administrador para renovar a tiempo.',
              ].filter(Boolean),
          { link: `${base}/account`, label: 'Ver suscripción' },
          'Renueva antes de la fecha para no interrumpir tu servicio.'
        ),
      }

    case 'trial_expired':
      return {
        subject: `${templateSubjects.trial_expired}: ${data.prestamistaName || data.email}`,
        html: layout(
          'Prueba vencida: prestamista en modo lectura',
          [
            `La prueba del prestamista <strong>${data.prestamistaName || data.email}</strong> venció y ahora está en <strong>modo lectura</strong> (no puede crear ni editar datos).`,
            data.email ? `<strong>Correo:</strong> ${data.email}` : '',
            'Renueva su plan para que recupere el acceso de escritura.',
          ].filter(Boolean),
          { link: `${base}/admin/users`, label: 'Revisar usuario' },
          'El usuario conserva el acceso de lectura hasta que se le asigne un plan.'
        ),
      }

    default:
      return { subject: 'Notificación de Gestor de Prestamos', html: layout('Notificación', ['Recibiste una notificación de Gestor de Prestamos.']) }
  }
}