'use client'

import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  max?: number
  className?: string
  variant?: 'blue' | 'green' | 'yellow' | 'red'
}

const variants = {
  blue: 'bg-primary',
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-destructive',
}

export function Progress({ value, max = 100, className, variant = 'blue' }: ProgressProps) {
  const pct = Math.min((value / max) * 100, 100)

  return (
    <div className={cn('w-full h-2 bg-muted rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-300', variants[variant])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
