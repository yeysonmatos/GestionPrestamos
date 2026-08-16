import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { getSmtpConfig, isSmtpConfigured } from '@/lib/notify/smtp'

const CONFIG_ID = '00000000-0000-0000-0000-00000000e601'

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response
  const { adminClient, supabaseResponse } = guard

  const { data } = await adminClient.from('smtp_config').select('*').eq('id', CONFIG_ID).maybeSingle()

  return NextResponse.json({
    config: data
      ? {
          host: data.host,
          port: data.port,
          secure: data.secure,
          username: data.username,
          // La contraseña NUNCA se devuelve por API (securidad). El client la
          // manda vacía y solo se actualiza si escribe una nueva.
          pass: '',
          from_name: data.from_name,
          from_email: data.from_email,
          enabled: data.enabled,
          configured: isSmtpConfigured(data as never),
        }
      : null,
  }, supabaseResponse)
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response
  const { adminClient, supabaseResponse } = guard

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {
    host: body.host ?? '',
    port: Number(body.port ?? 587),
    secure: !!body.secure,
    username: body.username ?? '',
    from_name: body.from_name ?? 'Gestor de Prestamos',
    from_email: body.from_email ?? '',
    enabled: !!body.enabled,
    updated_at: new Date().toISOString(),
  }
  // La contraseña solo se actualiza si el admin escribe una nueva (no se envía la existente cifrada de vuelta)
  if (typeof body.pass === 'string' && body.pass.length > 0) patch.pass = body.pass

  const { error } = await adminClient.from('smtp_config').update(patch).eq('id', CONFIG_ID)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

  return NextResponse.json({ ok: true }, supabaseResponse)
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response
  const { adminClient, supabaseResponse } = guard

  const body = await request.json().catch(() => ({}))
  const to = typeof body.to === 'string' ? body.to : ''

  const config = await getSmtpConfig(adminClient)
  if (!config || !isSmtpConfigured(config)) {
    return NextResponse.json({ ok: false, error: 'SMTP no configurado' }, supabaseResponse)
  }

  // Email de prueba: usa el transporte real con un HTML simple
  const { sendViaSmtp } = await import('@/lib/notify/smtp')
  const result = await sendViaSmtp(adminClient, {
    to: to || config.from_email,
    subject: 'Prueba — Gestor de Prestamos',
    html: '<p>Este es un correo de prueba de <strong>Gestor de Prestamos</strong>.</p><p>Si lo ves, tu configuración SMTP funciona correctamente.</p>',
  })

  if (!result.ok) {
    const raw = result.error
    // 0A00010B = "wrong version number": se inició TLS directo sobre un puerto que usa STARTTLS (o viceversa)
    const sslHint = /wrong version number|SSL routines/i.test(raw)
      ? ' — Parece un problema del SSL: si usas puerto 587 (STARTTLS) la casilla "Conexión segura (SSL)" debe estar DESMARCADA. Si usas puerto 465, debe estar MARCADA. Guarda y vuelve a probar.'
      : ''
    return NextResponse.json({ ok: false, error: raw + sslHint }, supabaseResponse)
  }
  return NextResponse.json({ ok: true }, supabaseResponse)
}