'use client'

import { cn } from '@/lib/utils'

export type BarDataPoint = {
  label: string
  value: number
  secondaryValue?: number
}

type SimpleBarChartProps = {
  data: BarDataPoint[]
  height?: number
  formatValue?: (v: number) => string
  primaryColor?: string
  secondaryColor?: string
  showSecondary?: boolean
  className?: string
}

export function SimpleBarChart({
  data,
  height = 160,
  formatValue,
  primaryColor = '#4ADE80',
  secondaryColor = '#F59E0B',
  showSecondary = false,
  className,
}: SimpleBarChartProps) {
  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondaryValue ?? 0)))
  const svgW = 600
  const svgH = height
  const paddingBottom = 28
  const paddingTop = 8
  const chartH = svgH - paddingBottom - paddingTop
  const barCount = data.length
  const groupW = svgW / barCount
  const barW = showSecondary ? groupW * 0.35 : groupW * 0.55
  const gap = showSecondary ? groupW * 0.05 : 0

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
      >
        {data.map((d, i) => {
          const cx = groupW * i + groupW / 2
          const barH = (d.value / maxVal) * chartH
          const x1 = showSecondary ? cx - barW - gap / 2 : cx - barW / 2
          const y1 = paddingTop + chartH - barH

          const secH = ((d.secondaryValue ?? 0) / maxVal) * chartH
          const x2 = cx + gap / 2
          const y2 = paddingTop + chartH - secH

          return (
            <g key={i}>
              {/* Primary bar */}
              <rect
                x={x1}
                y={y1}
                width={barW}
                height={barH}
                rx={2}
                fill={primaryColor}
                opacity={0.85}
              >
                {formatValue && <title>{formatValue(d.value)}</title>}
              </rect>
              {/* Secondary bar */}
              {showSecondary && d.secondaryValue != null && (
                <rect
                  x={x2}
                  y={y2}
                  width={barW}
                  height={secH}
                  rx={2}
                  fill={secondaryColor}
                  opacity={0.75}
                >
                  {formatValue && <title>{formatValue(d.secondaryValue)}</title>}
                </rect>
              )}
              {/* Label */}
              <text
                x={cx}
                y={svgH - 6}
                textAnchor="middle"
                fontSize={9}
                fill="#78716C"
                fontFamily="Space Mono, monospace"
              >
                {d.label}
              </text>
            </g>
          )
        })}
        {/* Baseline */}
        <line
          x1={0}
          y1={paddingTop + chartH}
          x2={svgW}
          y2={paddingTop + chartH}
          stroke="#2A2A2A"
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}
