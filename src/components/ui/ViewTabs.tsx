import { cn } from '@/lib/utils'

export interface ViewTabOption {
  key: string
  label: string
  count?: number
}

interface ViewTabsProps {
  options: ViewTabOption[]
  selected: string
  onSelect: (key: string) => void
  className?: string
  ariaLabel?: string
}

export default function ViewTabs({ options, selected, onSelect, className, ariaLabel }: ViewTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex items-center gap-1.5 overflow-x-auto no-scrollbar', className)}
    >
      {options.map(opt => {
        const isActive = opt.key === selected
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(opt.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors min-h-11 shrink-0',
              isActive
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-border'
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={cn(
                'text-[11px] font-semibold rounded-full px-1.5 py-0.5 leading-none',
                isActive ? 'bg-on-primary/20 text-on-primary' : 'bg-card text-muted-foreground'
              )}>
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}