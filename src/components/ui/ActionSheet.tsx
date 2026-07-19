'use client'

import { useEffect, useState, type ReactNode } from 'react'

interface Option {
  key: string
  label: string
  count?: number
}

interface Props {
  open: boolean
  onClose: () => void
  options: Option[]
  selected: string
  onSelect: (key: string) => void
  title?: string
}

export default function ActionSheet({ open, onClose, options, selected, onSelect, title }: Props) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
      setTimeout(() => setMounted(false), 300)
    }
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 transition-opacity duration-200" style={{ opacity: visible ? 1 : 0 }} />
      <div
        className="relative w-full max-w-lg bg-card rounded-t-2xl shadow-2xl pb-safe-bottom"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {title && (
          <div className="px-6 pb-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
          </div>
        )}
        <div className="max-h-72 overflow-y-auto px-2 pb-4">
          {options.map(opt => {
            const active = opt.key === selected
            return (
              <button
                key={opt.key}
                onClick={() => { onSelect(opt.key); onClose() }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <span>{opt.label}</span>
                {opt.count !== undefined && (
                  <span className={`text-xs ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                    {opt.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="px-4 pb-4">
          <button onClick={onClose}
            className="w-full py-3 text-sm font-semibold text-muted-foreground bg-muted rounded-xl hover:bg-border transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}