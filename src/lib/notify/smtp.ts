import nodemailer from 'nodemailer'
import dns from 'node:dns'
import net from 'node:net'
import type { SupabaseClient } from '@supabase/supabase-js'

// Vercel serverless no tiene ruta IPv6 → fuerza resolución IPv4 para todos los sockets (net/tls).
dns.setDefaultResultOrder('ipv4first')

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  username: string
  pass: string
  from_name: string
  from_email: string
  enabled: boolean
}

// Lee la configuración SMTP de la BD con cliente service-role (o cliente dado).
export async function getSmtpConfig(admin: SupabaseClient): Promise<SmtpConfig | null> {
  const { data } = await admin
    .from('smtp_config')
    .select('host, port, secure, username, pass, from_name, from_email, enabled')
    .limit(1)
    .maybeSingle()
  return data as SmtpConfig | null
}

export function isSmtpConfigured(cfg: SmtpConfig | null): boolean {
  return !!cfg && cfg.enabled && !!cfg.host && cfg.port > 0 && !!cfg.username && !!cfg.pass && !!cfg.from_email
}

interface TransportInput {
  to: string
  subject: string
  html: string
}

// Envía un email vía SMTP. Devuelve un error descriptivo o null si fue OK.
export async function sendViaSmtp(admin: SupabaseClient, input: TransportInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await getSmtpConfig(admin)
  if (!cfg || !isSmtpConfigured(cfg)) {
    return { ok: false, error: 'SMTP no configurado o deshabilitado' }
  }

  // nodemailer elige un IP al azar entre IPv4/IPv6 al resolver el hostname;
  // en Vercel la IPv6 no tiene ruta (ENETUNREACH). Resolvemos IPv4 nosotros
  // y conectamos a la IP literal (el hostname original se mantiene para SNI).
  let hostIp = cfg.host
  if (!net.isIP(cfg.host)) {
    try {
      const { address } = await dns.promises.lookup(cfg.host, { family: 4 })
      hostIp = address
    } catch {
      // si falla la resolución, usamos el hostname y que nodemailer lo intente
    }
  }

  const transporter = nodemailer.createTransport({
    host: hostIp,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.username, pass: cfg.pass },
    connectionTimeout: 15000,
    socketTimeout: 20000,
    // servername: no está en los tipos de @types/nodemailer pero es soportado en runtime
    // (mantiene el hostname original para SNI cuando conectamos a la IP literal).
    servername: cfg.host,
    tls: { servername: cfg.host },
  } as Parameters<typeof nodemailer.createTransport>[0])

  try {
    await transporter.sendMail({
      from: `"${cfg.from_name}" <${cfg.from_email}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}