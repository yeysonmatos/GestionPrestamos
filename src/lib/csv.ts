function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v).replace(/"/g, '""')
  return `"${s}"`
}

export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = headers.map(csvEscape).join(',')
  const body = rows.map(r => r.map(csvEscape).join(',')).join('\n')
  return `${head}\n${body}`
}

export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function downloadXlsx(headers: string[], rows: (string | number | null | undefined)[][], fileName: string): Promise<void> {
  const XLSX = await import('xlsx')
  const aoa = [headers, ...rows.map(r => r.map(v => (v === null || v === undefined ? '' : v)))]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Datos')
  XLSX.writeFile(book, fileName)
}