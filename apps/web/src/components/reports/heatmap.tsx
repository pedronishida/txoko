'use client'

import { cn } from '@/lib/utils'

type HeatmapProps = {
  // data[row][col] = value
  data: number[][]
  rowLabels: string[]
  colLabels: string[]
  formatValue?: (v: number) => string
  colorStart?: string
  colorEnd?: string
  className?: string
}

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t)
}

function interpolateColor(t: number): string {
  // dark (low) → green (high)
  const rA = 26, gA = 26, bA = 26    // #1A1A1A
  const rB = 74, gB = 222, bB = 128  // #4ADE80
  return `rgb(${lerp(rA, rB, t)},${lerp(gA, gB, t)},${lerp(bA, bB, t)})`
}

export function Heatmap({
  data,
  rowLabels,
  colLabels,
  formatValue,
  className,
}: HeatmapProps) {
  const maxVal = Math.max(1, ...data.flat())

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="text-[10px] border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="w-10" />
            {colLabels.map((col, i) => (
              <th key={i} className="font-data text-stone-dark font-normal pb-1 min-w-[28px]">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri}>
              <td className="text-stone-dark text-right pr-2 font-medium whitespace-nowrap">
                {rowLabels[ri]}
              </td>
              {row.map((val, ci) => {
                const t = val / maxVal
                const bg = interpolateColor(t)
                return (
                  <td
                    key={ci}
                    title={formatValue ? formatValue(val) : String(val)}
                    className="rounded cursor-default transition-opacity hover:opacity-90"
                    style={{
                      backgroundColor: bg,
                      width: 28,
                      height: 22,
                    }}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
