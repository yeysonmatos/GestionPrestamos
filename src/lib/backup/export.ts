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
    totalCount += (data || []).length
  }

  const summary = JSON.stringify({
    userId,
    timestamp,
    tables: tables.join(','),
    totalCount,
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
