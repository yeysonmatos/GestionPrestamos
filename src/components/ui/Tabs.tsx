'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabsContextType {
  value: string
  onChange: (v: string) => void
}

const TabsContext = createContext<TabsContextType>({ value: '', onChange: () => {} })

export function Tabs({ value: initialValue, onValueChange, children, className }: {
  value?: string
  onValueChange?: (v: string) => void
  children: ReactNode
  className?: string
}) {
  const [internalValue, setInternalValue] = useState(initialValue || '')
  const controlledValue = initialValue ?? internalValue

  return (
    <TabsContext.Provider value={{
      value: controlledValue,
      onChange: (v) => {
        setInternalValue(v)
        onValueChange?.(v)
      }
    }}>
      <div className={cn('space-y-4', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto [-webkit-overflow-scrolling:touch]', className)}>
      {children}
    </div>
  )
}

export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(TabsContext)

  return (
    <button
      onClick={() => ctx.onChange(value)}
      className={cn(
        'px-4 py-2 text-sm font-medium rounded-md transition-colors flex-shrink-0',
        ctx.value === value
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(TabsContext)

  if (ctx.value !== value) return null

  return <div className={className}>{children}</div>
}
