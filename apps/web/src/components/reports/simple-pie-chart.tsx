'use client'

import { cn } from '@/lib/utils'

export type PieSlice = {
  label: string
  value: number
  color?: string
}

const DEFAULT_COLORS = [
  '#4ADE80',
  '#F59E0B',
  '#60A5FA',
  '#F472B6',
  '#A78BFA',
  '#34D399',
  '#FB923C',
  '#38BDF8',
]

type SimplePieChartProps = {
  data: PieSlice[]
  size?: number
  donut?: boolean
  formatValue?: (v: number) => string
  showLegend?: boolean
  className?: string
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polarToCartesian(cx, cy, r, start)
  const e = polarToCartesian(cx, cy, r, end)
  const large = end - start > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

export function SimplePieChart({
  data,
  size = 140,
  donut = true,
  formatValue,
  showLegend = true,
  className,
}: SimplePieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) {
    return (
      <p className="text-[12px] text-stone tracking-tight text-center py-4">Sem dados</p>
    )
  }

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.42
  const innerR = donut ? r * 0.58 : 0

  let cumAngle = 0
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 360
    const start = cumAngle
    const end = cumAngle + angle
    cumAngle = end
    const color = d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]!
    return { ...d, start, end, angle, color }
  })

  return (
    <div className={cn('flex items-center gap-6', className)}>
      <svg width={size} height={size} className="shrink-0">
        {slices.map((s, i) => {
          if (s.angle < 0.5) return null
          const path = arcPath(cx, cy, r, s.start, s.end)
          return (
            <g key={i}>
              <path
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth={r - innerR}
                strokeLinecap="butt"
                opacity={0.9}
              >
                <title>
                  {s.label}: {formatValue ? formatValue(s.value) : s.value} (
                  {Math.round((s.value / total) * 100)}%)
                </title>
              </path>
            </g>
          )
        })}
        {donut && (
          <circle cx={cx} cy={cy} r={innerR} fill="transparent" />
        )}
      </svg>
      {showLegend && (
        <div className="flex flex-col gap-2 min-w-0">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[11px] text-stone-light tracking-tight truncate">
                {s.label}
              </span>
              <span className="text-[11px] font-data text-stone-dark ml-auto pl-2 shrink-0">
                {Math.round((s.value / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
