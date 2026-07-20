'use client'

import { useState, useMemo } from 'react'
import { Funnel, X, Calendar, CurrencyDollar, CaretDown, CaretUp, Sliders } from '@phosphor-icons/react'
import styles from './LoanFilters.module.css'

export interface LoanFiltersState {
  search: string
  status: string
  type: string
  frequency: string
  dateRange: { from: string; to: string }
  amountRange: { min: string; max: string }
  showFilters: boolean
}

export interface LoanFiltersActions {
  setSearch: (v: string) => void
  setStatus: (v: string) => void
  setType: (v: string) => void
  setFrequency: (v: string) => void
  setDateFrom: (v: string) => void
  setDateTo: (v: string) => void
  setAmountMin: (v: string) => void
  setAmountMax: (v: string) => void
  setAmountRange: (v: { min: string; max: string }) => void
  setShowFilters: (v: boolean) => void
  clearAll: () => void
  clearStatus: () => void
  clearDateRange: () => void
  clearAmountRange: () => void
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'paid', label: 'Pagados' },
  { value: 'late', label: 'Atrasados' },
  { value: 'cancelled', label: 'Cancelados' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'french', label: 'Francesa' },
  { value: 'interest_only', label: 'Interés' },
]

const FREQUENCY_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
]

function Chip({ label, count, selected, onClick }: { label: string; count?: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      className={`${styles.chip} ${selected ? styles.chipActive : ''}`}
      onClick={onClick}
      type="button"
    >
      {label}
      {count !== undefined && <span className={styles.chipCount}>{count}</span>}
    </button>
  )
}

function SectionHeader({ title, onClear, hasActive }: { title: string; onClear?: () => void; hasActive?: boolean }) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionTitle}>{title}</span>
      {onClear && hasActive && (
        <button className={styles.clearSectionBtn} onClick={onClear} aria-label="Limpiar">
          <X className={styles.clearSectionIcon} />
        </button>
      )}
    </div>
  )
}

function ChipRow({ options, selected, onChange, counts }: { options: { value: string; label: string }[]; selected: string; onChange: (v: string) => void; counts?: Record<string, number> }) {
  return (
    <div className={styles.chipRow}>
      {options.map(opt => (
        <Chip
          key={opt.value}
          label={opt.label}
          selected={selected === opt.value}
          count={counts?.[opt.value]}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </div>
  )
}

function DateField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className={styles.dateField}>
      <span className={styles.dateLabel}>{label}</span>
      <input
        type="date"
        className={styles.dateInput}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}

function AmountField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className={styles.amountField}>
      <span className={styles.amountLabel}>{label}</span>
      <input
        type="number"
        className={styles.amountInput}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        step="0.01"
        min="0"
      />
    </label>
  )
}

export function LoanFilters({
  state,
  actions,
  counts = {},
}: {
  state: LoanFiltersState
  actions: LoanFiltersActions
  counts?: {
    status?: Record<string, number>
    type?: Record<string, number>
    frequency?: Record<string, number>
  }
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    status: true,
    type: true,
    frequency: true,
    dates: true,
    amounts: true,
  })

  const hasActiveFilters = useMemo(() => 
    state.status !== 'all' ||
    state.type !== 'all' ||
    state.frequency !== 'all' ||
    state.dateRange.from ||
    state.dateRange.to ||
    state.amountRange.min ||
    state.amountRange.max,
  [state])

  const activeCount = useMemo(() => 
    (state.status !== 'all' ? 1 : 0) +
    (state.type !== 'all' ? 1 : 0) +
    (state.frequency !== 'all' ? 1 : 0) +
    (state.dateRange.from || state.dateRange.to ? 1 : 0) +
    (state.amountRange.min || state.amountRange.max ? 1 : 0),
  [state])

  return (
    <div className={styles.filterContainer}>
      {/* Search + Filter Toggle */}
      <div className={styles.searchFilterRow}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por cliente, ID, teléfono..."
            value={state.search}
            onChange={e => actions.setSearch(e.target.value)}
          />
        </div>

        <button
          className={`${styles.filterToggle} ${state.showFilters ? styles.active : ''}`}
          onClick={() => actions.setShowFilters(!state.showFilters)}
          aria-label="Filtros"
        >
          <Sliders className={styles.filterIcon} size={16} />
          <span>Filtros</span>
          {activeCount > 0 && <span className={styles.filterBadge}>{activeCount}</span>}
        </button>
      </div>

      {/* Filter Panel */}
      {state.showFilters && (
        <div className={styles.filterPanel}>
          <div className={styles.filterHeader}>
            <h3 className={styles.filterPanelTitle}>Filtros</h3>
            <button className={styles.clearAllBtn} onClick={actions.clearAll} disabled={!hasAnyActiveFilter()}>
              <X className={styles.clearIcon} /> Limpiar todo
            </button>
          </div>

          {/* Estado */}
          <div className={styles.filterSection}>
            <SectionHeader title="Estado" hasActive={state.status !== 'all'} onClear={actions.clearStatus} />
            {<ChipRow options={STATUS_OPTIONS} selected={state.status} onChange={actions.setStatus} counts={counts.status} />}
          </div>

          {/* Tipo */}
          <div className={styles.filterSection}>
            <SectionHeader title="Tipo" hasActive={state.type !== 'all'} onClear={() => actions.setType('all')} />
            {<ChipRow options={TYPE_OPTIONS} selected={state.type} onChange={actions.setType} counts={counts.type} />}
          </div>

          {/* Frecuencia */}
          <div className={styles.filterSection}>
            <SectionHeader title="Frecuencia" hasActive={state.frequency !== 'all'} onClear={() => actions.setFrequency('all')} />
            {<ChipRow options={FREQUENCY_OPTIONS} selected={state.frequency} onChange={actions.setFrequency} counts={counts.frequency} />}
          </div>

          {/* Rango de fechas */}
          <div className={styles.filterSection}>
            <SectionHeader title="Rango de fechas" hasActive={!!(state.dateRange.from || state.dateRange.to)} onClear={actions.clearDateRange} />
            <div className={styles.dateRow}>
              <DateField label="Desde" value={state.dateRange.from} onChange={actions.setDateFrom} />
              <span className={styles.dateArrow}>→</span>
              <DateField label="Hasta" value={state.dateRange.to} onChange={actions.setDateTo} />
            </div>
            {(state.dateRange.from || state.dateRange.to) && (
              <button className={styles.clearBtn} onClick={actions.clearDateRange}>× Limpiar rango</button>
            )}
          </div>

          {/* Rango de montos */}
          <div className={styles.filterSection}>
            <SectionHeader title="Rango de montos" hasActive={!!(state.amountRange.min || state.amountRange.max)} onClear={actions.clearAmountRange} />
            <div className={styles.amountRow}>
              <AmountField label="Mín" value={state.amountRange.min} onChange={v => actions.setAmountRange({ ...state.amountRange, min: v })} placeholder="0" />
              <span className={styles.amountArrow}>→</span>
              <AmountField label="Máx" value={state.amountRange.max} onChange={v => actions.setAmountRange({ ...state.amountRange, max: v })} placeholder="∞" />
            </div>
          </div>

          {/* Active Filters Summary */}
          {hasAnyActiveFilter() && (
            <div className={styles.activeFiltersSummary}>
              <span className={styles.activeFiltersLabel}>Filtros activos:</span>
              <div className={styles.activeFiltersChips}>
                {state.status !== 'all' && <ActiveFilterChip label={STATUS_OPTIONS.find(o => o.value === state.status)?.label ?? state.status} onRemove={actions.clearStatus} />}
                {state.type !== 'all' && <ActiveFilterChip label={TYPE_OPTIONS.find(o => o.value === state.type)?.label ?? state.type} onRemove={() => actions.setType('all')} />}
                {state.frequency !== 'all' && <ActiveFilterChip label={FREQUENCY_OPTIONS.find(o => o.value === state.frequency)?.label ?? state.frequency} onRemove={() => actions.setFrequency('all')} />}
                {state.dateRange.from && <ActiveFilterChip label={`Desde ${state.dateRange.from}`} onRemove={actions.clearDateRange} />}
                {state.dateRange.to && <ActiveFilterChip label={`Hasta ${state.dateRange.to}`} onRemove={actions.clearDateRange} />}
                {state.amountRange.min && <ActiveFilterChip label={`Mín ${state.amountRange.min}`} onRemove={() => actions.setAmountRange({ ...state.amountRange, min: '' })} />}
                {state.amountRange.max && <ActiveFilterChip label={`Máx ${state.amountRange.max}`} onRemove={() => actions.setAmountRange({ ...state.amountRange, max: '' })} />}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  function hasAnyActiveFilter() {
    return state.status !== 'all' || state.type !== 'all' || state.frequency !== 'all' || 
           state.dateRange.from || state.dateRange.to || state.amountRange.min || state.amountRange.max
  }
}

function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className={styles.activeFilterChip}>
      {label}
      <button onClick={onRemove} aria-label="Eliminar">
        <X className={styles.chipRemoveIcon} />
      </button>
    </span>
  )
}