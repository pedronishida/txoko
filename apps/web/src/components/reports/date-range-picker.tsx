'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export type DateRange = {
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
}

export type DatePreset =
  | 'today'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'this_year'

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'this_month', label: 'Mes atual' },
  { key: 'last_month', label: 'Mes passado' },
  { key: 'this_year', label: 'Ano atual' },
]

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function presetToRange(preset: DatePreset): DateRange {
  const now = new Date()
  const today = toYMD(now)

  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case '7d': {
      const from = new Date(now)
      from.setDate(from.getDate() - 6)
      return { from: toYMD(from), to: today }
    }
    case '30d': {
      const from = new Date(now)
      from.setDate(from.getDate() - 29)
      return { from: toYMD(from), to: today }
    }
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: toYMD(from), to: today }
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const to = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: toYMD(from), to: toYMD(to) }
    }
    case 'this_year': {
      const from = new Date(now.getFullYear(), 0, 1)
      return { from: toYMD(from), to: today }
    }
  }
}

type DateRangePickerProps = {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [activePreset, setActivePreset] = useState<DatePreset | null>('this_month')

  function handlePreset(preset: DatePreset) {
    setActivePreset(preset)
    onChange(presetToRange(preset))
  }

  function handleCustom(field: 'from' | 'to', val: string) {
    setActivePreset(null)
    onChange({ ...value, [field]: val })
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => handlePreset(p.key)}
          className={cn(
            'text-[11px] tracking-tight px-3 h-7 rounded border transition-colors',
            activePreset === p.key
              ? 'border-leaf/60 bg-leaf/10 text-leaf'
              : 'border-night-lighter text-stone hover:text-cloud hover:border-stone-dark'
          )}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5 ml-1">
        <input
          type="date"
          value={value.from}
          onChange={(e) => handleCustom('from', e.target.value)}
          className="text-[11px] font-data bg-night-light border border-night-lighter rounded px-2 h-7 text-cloud focus:outline-none focus:border-stone-dark"
        />
        <span className="text-stone-dark text-[11px]">–</span>
        <input
          type="date"
          value={value.to}
          onChange={(e) => handleCustom('to', e.target.value)}
          className="text-[11px] font-data bg-night-light border border-night-lighter rounded px-2 h-7 text-cloud focus:outline-none focus:border-stone-dark"
        />
      </div>
    </div>
  )
}
