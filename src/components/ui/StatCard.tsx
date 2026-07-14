import { Card } from './Card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  trend?: { value: string; positive: boolean }
  className?: string
}

export default function StatCard({ label, value, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{value}</p>
          {trend && (
            <p className={cn(
              'text-xs font-medium mt-1',
              trend.positive ? 'text-success' : 'text-destructive'
            )}>
              {trend.positive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        {Icon && (
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
        )}
      </div>
    </Card>
  )
}
