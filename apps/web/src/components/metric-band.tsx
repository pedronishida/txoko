'use client'

import { cn } from '@/lib/utils'

type MetricItem = {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'neutral'
}

type MetricBandProps = {
  metrics: MetricItem[]
  columns?: 3 | 4
  border?: boolean
  className?: string
}

const toneColor: Record<string, string> = {
  positive: 'text-leaf',
  negative: 'text-coral',
  neutral: 'text-cloud',
}

export function MetricBand({
  metrics,
  columns = 4,
  border = true,
  className,
}: MetricBandProps) {
  return (
    <div
      className={cn(
        'grid gap-x-8 gap-y-4',
        columns === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4',
        border && 'pb-5 mb-5 border-b border-night-lighter',
        className
      )}
    >
      {metrics.map((m) => (
        <div key={m.label}>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone">
            {m.label}
          </p>
          <p
            className={cn(
              'text-[20px] font-medium tracking-[-0.02em] leading-none font-data mt-1.5',
              toneColor[m.tone ?? 'neutral']
            )}
          >
            {m.value}
          </p>
        </div>
      ))}
    </div>
  )
}
