import { Tray } from '@phosphor-icons/react'

interface EmptyStateProps {
  title?: string
  description?: string
  action?: React.ReactNode
  icon?: React.ReactNode
}

export default function EmptyState({
  title = 'Sin datos',
  description = 'No hay información para mostrar.',
  action,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        {icon || <Tray className="h-8 w-8 text-muted-foreground" />}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-sm">{description}</p>
      {action}
    </div>
  )
}
