import { cn } from '@/lib/utils'

type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

interface AlertProps {
  variant?: AlertVariant
  children: React.ReactNode
  className?: string
}

const styles: Record<AlertVariant, string> = {
  info: 'bg-primary-light/15 text-primary border-primary/20',
  success: 'bg-success-light/20 text-emerald-800 border-success/30',
  warning: 'bg-warning-light text-amber-800 border-warning/30',
  danger: 'bg-red-50 text-red-700 border-red-200',
}

export function Alert({ variant = 'info', children, className }: AlertProps) {
  return (
    <div className={cn('rounded-lg border p-3 text-sm', styles[variant], className)}>
      {children}
    </div>
  )
}