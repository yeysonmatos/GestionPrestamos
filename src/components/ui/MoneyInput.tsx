'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn, cleanAmount } from '@/lib/utils'

interface MoneyInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  error?: string
  placeholder?: string
  className?: string
  required?: boolean
  autoFocus?: boolean
  id?: string
}

function formatDisplay(v: string): string {
  const clean = v.replace(/[^0-9.]/g, '')
  const parts = clean.split('.')
  if (parts.length > 2) return v
  const intPart = parts[0]
  if (!intPart) return v
  const num = Number(clean)
  const rounded = Number.isFinite(num) ? String(cleanAmount(num)) : clean
  const rParts = rounded.split('.')
  const formatted = new Intl.NumberFormat('es-MX', { style: 'decimal', maximumFractionDigits: 0 }).format(Number(rParts[0]))
  return rParts[1] !== undefined ? `${formatted}.${rParts[1]}` : formatted
}

function stripFormatting(v: string): string {
  const clean = v.replace(/[^0-9.]/g, '')
  const num = Number(clean)
  return v && Number.isFinite(num) ? String(cleanAmount(num)) : v.replace(/,/g, '')
}

export default function MoneyInput({ value, onChange, label, error, className, placeholder, required, autoFocus, id }: MoneyInputProps) {
  const [focused, setFocused] = useState(false)
  const [localDisplay, setLocalDisplay] = useState('')

  useEffect(() => {
    setLocalDisplay(focused ? stripFormatting(value) : formatDisplay(value))
  }, [value, focused])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '')
    const dotCount = raw.split('.').length - 1
    if (dotCount > 1) return
    setLocalDisplay(raw)
    onChange(raw)
  }, [onChange])

  const handleFocus = useCallback(() => {
    setFocused(true)
    setLocalDisplay(stripFormatting(value))
  }, [value])

  const handleBlur = useCallback(() => {
    setFocused(false)
    setLocalDisplay(formatDisplay(value))
  }, [value])

  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        value={localDisplay}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        className={cn(
          'block w-full min-w-0 rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring bg-card min-h-11',
          error ? 'border-destructive focus:ring-destructive' : 'border-border',
          className
        )}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
