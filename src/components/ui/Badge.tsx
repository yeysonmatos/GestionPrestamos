import { cn } from '@/lib/utils'

type BadgeVariant = 'active' | 'paid' | 'cancelled' | 'default' | 'late'

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
}

const styles: Record<BadgeVariant, string> = {
  active: 'bg-warning-light text-warning',
  paid: 'bg-success-light text-success',
  late: 'bg-red-100 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
  default: 'bg-primary-light text-primary',
}

export default function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      styles[variant]
    )}>
      {children}
    </span>
  )
}
