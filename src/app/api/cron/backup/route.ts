import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { exportBackup, pruneOldBackups } from '@/lib/backup/export'

const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30)

/**
 * Cron diario de respaldo automático (A2):
 *  - Iterar todos los usuarios de la plataforma (app_users).
 *  - Generar su backup completo en storage/backups.
 *  - Purga backups con más de BACKUP_RETENTION_DAYS (default 30).
 *
 * Protegido con CRON_SECRET (vercel.json añade el header automáticamente).
 */
export async function POST(request: NextRequest) {
  return handleCron(request)
}

export async function GET(request: NextRequest) {
  return handleCron(request)
}

async function handleCron(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' }, { status: 500 })
  }

  const { data: appUsers, error: usersError } = await admin.from('app_users').select('id')
  if (usersError) {
    return NextResponse.json({ error: `Error cargando usuarios: ${usersError.message}` }, { status: 500 })
  }

  const userIds = (appUsers || []).map(u => u.id)
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, backups: 0, purged: 0, users: 0 })
  }

  let backups = 0
  let purged = 0
  const errors: string[] = []

  for (const userId of userIds) {
    try {
      const result = await exportBackup(admin, userId)
      if ('error' in result) {
        errors.push(`usuario ${userId}: ${result.error}`)
        continue
      }
      backups++

      const prune = await pruneOldBackups(admin, userId, RETENTION_DAYS)
      if (prune.error) {
        errors.push(`usuario ${userId} (purga): ${prune.error}`)
      } else {
        purged += prune.deleted
      }
    } catch (err: any) {
      errors.push(`usuario ${userId}: ${String(err?.message || err)}`)
    }
  }

  return NextResponse.json({ ok: true, backups, purged, users: userIds.length, errors })
}