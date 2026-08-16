import { createHash } from 'crypto'
import { BACKUP_TABLES, getBackupFolder, getBackupTimestamp } from './tables'
import type { SupabaseClient } from '@supabase/supabase-js'

function toCSV(data: Record<string, any>[]): string {
  if (!data || data.length === 0) return ''
  const keys = Object.keys(data[0])
  const esc = (v: any) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const header = keys.join(',')
  const rows = data.map(row => keys.map(k => esc(row[k])).join(','))
  return [header, ...rows].join('\n')
}

export async function exportBackup(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ path: string; tables: string[]; count: number } | { error: string }> {
  const timestamp = getBackupTimestamp()
  const folder = `${getBackupFolder(userId)}/${timestamp}`
  const tables: string[] = []
  const checksums: Record<string, string> = {}
  let totalCount = 0

  for (const table of BACKUP_TABLES) {
    let query = supabase.from(table.name).select('*')
    if (table.filterColumn) query = query.eq(table.filterColumn, userId)
    const { data, error } = await query.order(table.orderColumn, { ascending: true })

    if (error) return { error: `Error al exportar ${table.name}: ${error.message}` }

    const csv = toCSV(data || [])
    const fileName = `${folder}/${table.name}.csv`
    const { error: uploadError } = await supabase.storage
      .from('backups')
      .upload(fileName, csv, { contentType: 'text/csv', upsert: false })

    if (uploadError) {
      return { error: `Error al subir ${table.name}: ${uploadError.message}` }
    }

    tables.push(table.name)
    checksums[table.name] = createHash('sha256').update(csv).digest('hex')
    totalCount += (data || []).length
  }

  const summary = JSON.stringify({
    userId,
    timestamp,
    tables: tables.join(','),
    totalCount,
    checksums,
    exportedAt: new Date().toISOString(),
  })
  const { error: manifestError } = await supabase.storage
    .from('backups')
    .upload(`${folder}/manifest.json`, summary, { contentType: 'application/json', upsert: false })

  if (manifestError) {
    return { error: `Error al subir manifest.json: ${manifestError.message}` }
  }

  return { path: folder, tables, count: totalCount }
}

/**
 * Elimina backups de un usuario más antiguos que `retentionDays` días.
 * Devuelve la lista de folders borrados.
 */
export async function pruneOldBackups(
  supabase: SupabaseClient,
  userId: string,
  retentionDays = 30,
): Promise<{ deleted: number; error?: string }> {
  const prefix = getBackupFolder(userId)
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000

  const { data: folders, error } = await supabase.storage
    .from('backups')
    .list(prefix, { sortBy: { column: 'name', order: 'desc' } })

  if (error) return { deleted: 0, error: error.message }
  if (!folders?.length) return { deleted: 0 }

  const toDelete: string[] = []
  for (const item of folders) {
    if (!item.name || !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(item.name)) continue
    const folderDate = new Date(
      Number(item.name.slice(0, 4)),
      Number(item.name.slice(5, 7)) - 1,
      Number(item.name.slice(8, 10)),
      Number(item.name.slice(11, 13)),
      Number(item.name.slice(14, 16)),
      Number(item.name.slice(17, 19)),
    ).getTime()
    if (folderDate < cutoff) {
      toDelete.push(`${prefix}/${item.name}`)
    }
  }

  if (toDelete.length === 0) return { deleted: 0 }

  const { error: delError } = await supabase.storage.from('backups').remove(toDelete)
  if (delError) return { deleted: 0, error: delError.message }
  return { deleted: toDelete.length }
}
