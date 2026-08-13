import { Card } from './Card'
import { cn } from '@/lib/utils'
import type { Icon } from '@phosphor-icons/react'
import { ArrowUp, ArrowDown } from '@phosphor-icons/react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: Icon
  iconClassName?: string
  trend?: { value: string; positive: boolean }
  className?: string
}

export default function StatCard({ label, value, icon: IconCmp, iconClassName, trend, className }: StatCardProps) {
  return (
    <Card className={cn('relative', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-lg md:text-xl xl:text-2xl font-bold text-foreground mt-1 break-words">{value}</p>
          {trend && (
            <p className={cn(
              'text-xs font-medium mt-1',
              trend.positive ? 'text-success' : 'text-destructive'
            )}>
              {trend.positive ? <ArrowUp className="h-3 w-3 inline mr-0.5" /> : <ArrowDown className="h-3 w-3 inline mr-0.5" />}{trend.value}
            </p>
          )}
        </div>
        {IconCmp && (
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border">
            <IconCmp className={cn('h-4 w-4 md:h-5 md:w-5', iconClassName || 'text-primary')} />
          </div>
        )}
      </div>
    </Card>
  )
}
