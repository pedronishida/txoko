'use client'

import { cn } from '@/lib/utils'

type ReportCardProps = {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative' | 'neutral' | 'warn'
  className?: string
}

const toneColor: Record<string, string> = {
  positive: 'text-leaf',
  negative: 'text-coral',
  neutral: 'text-cloud',
  warn: 'text-warm',
}

export function ReportCard({ label, value, sub, tone = 'neutral', className }: ReportCardProps) {
  return (
    <div className={cn('bg-night-light/30 border border-night-lighter rounded-lg p-4', className)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone mb-2">
        {label}
      </p>
      <p className={cn('text-[22px] font-medium tracking-[-0.02em] leading-none font-data', toneColor[tone])}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-stone-dark tracking-tight mt-1.5">{sub}</p>
      )}
    </div>
  )
}
