import { BACKUP_TABLES, getBackupFolder, RESTORE_ORDER } from './tables'
import type { SupabaseClient } from '@supabase/supabase-js'

function parseCSV(csv: string): Record<string, any>[] {
  if (!csv.trim()) return []
  const lines = csv.split('\n')
  const header = lines[0].split(',').map(h => h.trim())
  const rows: Record<string, any>[] = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = parseCSVLine(lines[i])
    if (values.length !== header.length) continue
    const row: Record<string, any> = {}
    header.forEach((h, idx) => {
      const val = values[idx]
      row[h] = val === '' ? null : val
    })
    rows.push(row)
  }
  return rows
}

function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        values.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  values.push(current)
  return values
}

function parseValue(value: any, key: string): any {
  if (value === null || value === undefined || value === '') return null
  const numericKeys = ['amount', 'total_amount', 'total_interest', 'installment_amount', 'remaining_amount', 'paid_amount', 'capital', 'interest', 'balance', 'paid_late_amount', 'late_amount', 'capital_amount', 'interest_amount', 'late_amount', 'monthly_income', 'trust_score', 'interest_rate', 'late_interest_rate', 'late_days', 'installments', 'paid_installments', 'progress', 'number', 'size', 'grace_days', 'notify_upcoming_days', 'default_installments', 'payment_day', 'gps_lat', 'gps_lng', 'total_loans', 'active_loans', 'paid_loans', 'late_loans', 'total_borrowed', 'total_paid', 'total_interest']
  const boolKeys = ['open_ended']
  if (boolKeys.includes(key)) return value === 'true' || value === true
  if (numericKeys.includes(key)) {
    const num = Number(value)
    return isNaN(num) ? null : num
  }
  return value
}

export async function restoreBackup(
  supabase: SupabaseClient,
  userId: string,
  folder: string,
): Promise<{ tables: string[]; count: number } | { error: string }> {
  const tables: string[] = []
  let totalCount = 0

  for (const tableName of RESTORE_ORDER) {
    const url = `${getBackupFolder(userId)}/${folder}/${tableName}.csv`
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('backups')
      .download(url)

    if (downloadError) {
      if (downloadError.message.includes('not found')) continue
      return { error: `Error al descargar ${tableName}: ${downloadError.message}` }
    }

    const csv = await fileData.text()
    const rows = parseCSV(csv)
    if (rows.length === 0) continue

    const tableConfig = BACKUP_TABLES.find(t => t.name === tableName)
    if (!tableConfig) continue

    let deleteError: { message: string } | null = null

    if (tableName === 'installments') {
      const { data: loanRows } = await supabase.from('loans').select('id').eq('user_id', userId)
      const loanIds = (loanRows || []).map(l => l.id)
      if (loanIds.length > 0) {
        const { error: err } = await supabase.from('installments').delete().in('loan_id', loanIds)
        deleteError = err
      }
    } else {
      let deleteQuery = supabase.from(tableName).delete()
      if (tableConfig.filterColumn) deleteQuery = deleteQuery.eq(tableConfig.filterColumn, userId)
      const { error: err } = await deleteQuery
      deleteError = err
    }

    if (deleteError) return { error: `Error al limpiar ${tableName}: ${deleteError.message}` }

    const typedRows = rows.map(row => {
      const typed: Record<string, any> = {}
      for (const [key, val] of Object.entries(row)) {
        typed[key] = parseValue(val, key)
      }
      const hasUserId = Object.keys(row).some(k => k === 'user_id')
      if (!hasUserId && tableConfig.filterColumn) {
        typed.user_id = userId
      }
      return typed
    })

    const batchSize = 50
    for (let i = 0; i < typedRows.length; i += batchSize) {
      const batch = typedRows.slice(i, i + batchSize)
      const { error: insertError } = await supabase
        .from(tableName)
        .insert(batch)

      if (insertError) return { error: `Error al restaurar ${tableName}: ${insertError.message}` }
    }

    tables.push(tableName)
    totalCount += typedRows.length
  }

  return { tables, count: totalCount }
}

export async function listBackups(
  supabase: SupabaseClient,
  userId: string,
): Promise<Array<{ folder: string; timestamp: string; tables: number; count: number; createdAt: string }>> {
  const prefix = getBackupFolder(userId)

  const { data: folders, error } = await supabase.storage
    .from('backups')
    .list(prefix, { sortBy: { column: 'name', order: 'desc' } })

  if (error) return []

  const backups: Array<{ folder: string; timestamp: string; tables: number; count: number; createdAt: string }> = []

  for (const item of folders) {
    if (!item.name || !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(item.name)) continue
    const manifestUrl = `${prefix}/${item.name}/manifest.json`
    const { data: manifestData } = await supabase.storage
      .from('backups')
      .download(manifestUrl)

    let tables = 0
    let count = 0
    let createdAt = ''
    if (manifestData) {
      try {
        const manifest = JSON.parse(await manifestData.text())
        tables = manifest.tables ? manifest.tables.split(',').length : 0
        count = manifest.totalCount || 0
        createdAt = manifest.exportedAt || ''
      } catch {}
    }
    backups.push({ folder: item.name, timestamp: item.name, tables, count, createdAt })
  }

  return backups
}
