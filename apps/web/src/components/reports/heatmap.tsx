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

// A rampa vai de --sunken (nada) ate --teal (pico), misturada em oklab para o
// meio nao passar por um cinza sujo. Como os dois extremos continuam sendo
// tokens, o heatmap acompanha o tema sem precisar de uma segunda paleta.
function interpolateColor(t: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, t)) * 100)
  return `color-mix(in oklab, var(--teal) ${pct}%, var(--sunken))`
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
              <th key={i} className="font-data text-muted font-normal pb-1 min-w-[28px]">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri}>
              <td className="text-muted text-right pr-2 font-medium whitespace-nowrap">
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
