'use client'

import { cn } from '@/lib/utils'

type ReportCardProps = {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative' | 'neutral' | 'warn' | 'primary'
  className?: string
}

const toneColor: Record<string, string> = {
  positive: 'text-success',
  negative: 'text-destructive',
  neutral: 'text-foreground',
  warn: 'text-accent-foreground',
  primary: 'text-primary',
}

export function ReportCard({ label, value, sub, tone = 'neutral', className }: ReportCardProps) {
  return (
    <div
      className={cn('panel p-4 hover-lift', className)}
      style={{ boxShadow: 'var(--shadow-island)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">
        {label}
      </p>
      <p className={cn('text-[24px] font-semibold tracking-[-0.02em] leading-none font-data', toneColor[tone])}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-muted tracking-tight mt-2">{sub}</p>
      )}
    </div>
  )
}
