const RESEND_URL = 'https://api.resend.com/emails'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

// Envía un email vía Resend. Nunca lanza: si falta la API key o falla,
// registra el error y devuelve false para no bloquear la acción principal.
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev'
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY no configurado, omitiendo envío')
    return false
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!res.ok) {
      console.error('[email] Resend error:', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('[email] Fallo al enviar:', err)
    return false
  }
}

export function simpleHtml(body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#222">
  <p>${body.replace(/\n/g, '<br/>')}</p>
</div>`
}