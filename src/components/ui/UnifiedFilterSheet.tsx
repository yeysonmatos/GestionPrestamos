'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Angle, Funnel, Check } from '@phosphor-icons/react'

interface Option {
  key: string
  label: string
  count?: number
}

interface FilterSection {
  key: string
  title: string
  options: Option[]
  allowMultiple?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  sections: FilterSection[]
  selected: Record<string, string | string[]>
  onChange: (sectionKey: string, value: string | string[]) => void
  title?: string
  showApplyButton?: boolean
  onApply?: () => void
}

export default function UnifiedFilterSheet({
  open,
  onClose,
  sections,
  selected,
  onChange,
  title = 'Filtros',
  showApplyButton = true,
  onApply,
}: Props) {
  const [mounted, setMounted] = useState(open)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      document.body.style.overflow = 'hidden'
    } else {
      setTimeout(() => setMounted(false), 300)
    }
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

  const getSelected = (sectionKey: string) => selected[sectionKey]
  const isSelected = (sectionKey: string, optionKey: string) => {
    const sel = getSelected(sectionKey)
    if (Array.isArray(sel)) return sel.includes(optionKey)
    return sel === optionKey
  }

  const toggleOption = (sectionKey: string, optionKey: string) => {
    const current = getSelected(sectionKey)
    const section = sections.find(s => s.key === sectionKey)
    const allowMultiple = section?.allowMultiple ?? false

    if (allowMultiple) {
      const arr = (Array.isArray(current) ? current : []) as string[]
      const next = arr.includes(optionKey)
        ? arr.filter(k => k !== optionKey)
        : [...arr, optionKey]
      onChange(sectionKey, next)
    } else {
      onChange(sectionKey, current === optionKey ? 'all' : optionKey)
    }
  }

  const hasActiveFilters = () =>
    Object.entries(selected).some(([k, v]) => {
      if (Array.isArray(v)) return v.length > 0 && !v.includes('all')
      return v !== 'all' && v !== ''
    })

  const clearAll = () => {
    sections.forEach(s => onChange(s.key, s.allowMultiple ? [] : 'all'))
  }

  const activeCount = () =>
    Object.entries(selected).reduce((acc, [k, v]) => {
      if (Array.isArray(v)) return acc + v.filter(x => x !== 'all').length
      return acc + (v !== 'all' && v !== '' ? 1 : 0)
    }, 0)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="fixed inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className="relative w-full max-w-sm sm:max-w-md lg:max-w-lg xl:max-w-xl bg-card rounded-t-2xl shadow-2xl pb-safe-bottom"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={e => e.stopPropagation()}
            ref={scrollRef}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-border" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground min-h-10 min-w-10 flex items-center justify-center rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sections */}
            <div className="max-h-[65vh] overflow-y-auto px-4 pb-4">
              {sections.map(section => {
                const sel = getSelected(section.key)
                const isMulti = section.allowMultiple
                const activeKeys = isMulti
                  ? (Array.isArray(sel) ? sel : [])
                  : sel !== 'all' ? [sel] : []
                const activeCountSection = activeKeys.filter(k => k !== 'all').length

                return (
                  <div key={section.key} className="space-y-3 pb-4 border-b border-border/50 last:border-0">
                    {/* Section Header */}
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                      <div className="flex items-center gap-2">
                        {activeCountSection > 0 && (
                          <span className="text-xs text-primary font-medium px-2 py-0.5 bg-primary/10 rounded-full">
                            {activeCountSection}
                          </span>
                        )}
                        {activeCountSection > 0 && (
                          <button
                            onClick={() => onChange(section.key, isMulti ? [] : 'all')}
                            className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded transition-colors"
                          >
                            Limpiar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Options */}
                    <div className="space-y-1 px-2">
                      {section.options.map(opt => {
                        const checked = isSelected(section.key, opt.key)
                        const isAll = opt.key === 'all'

                        return (
                          <label
                            key={opt.key}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                              checked
                                ? 'bg-primary/5 text-primary'
                                : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {isMulti ? (
                                <Check
                                  className={`h-5 w-5 flex-shrink-0 transition-colors ${
                                    checked ? 'text-primary' : 'text-muted-foreground'
                                  }`}
                                  weight={checked ? 'fill' : 'regular'}
                                />
                              ) : (
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                  checked ? 'border-primary bg-primary' : 'border-border'
                                }`}>
                                  {checked && <Check className="h-3 w-3 text-on-primary" weight="fill" />}
                                </div>
                              )}
                              <span className="flex-1 min-w-0 truncate">{opt.label}</span>
                              {opt.count !== undefined && (
                                <span className={`text-xs font-medium ${checked ? 'text-primary' : 'text-muted-foreground'}`}>
                                  {opt.count}
                                </span>
                              )}
                            </div>
                            <input
                              type={isMulti ? 'checkbox' : 'radio'}
                              name={section.key}
                              checked={checked}
                              onChange={() => toggleOption(section.key, opt.key)}
                              className="sr-only"
                            />
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer Actions */}
            {showApplyButton && (
              <div className="px-4 py-4 border-t border-border flex gap-2">
                <button
                  onClick={clearAll}
                  className="flex-1 py-3 text-sm font-semibold text-muted-foreground bg-muted rounded-xl hover:bg-border transition-colors"
                  disabled={!hasActiveFilters()}
                >
                  Limpiar todo
                </button>
                <button
                  onClick={() => { onApply?.(); onClose() }}
                  className="flex-1 py-3 text-sm font-semibold text-on-primary bg-primary rounded-xl hover:bg-primary-hover transition-colors"
                >
                  Aplicar <span className="ml-1">({activeCount()})</span>
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export type { FilterSection, Option }