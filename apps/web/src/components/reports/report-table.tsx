'use client'

import { cn } from '@/lib/utils'

export type ColumnDef<T> = {
  key: keyof T | string
  label: string
  align?: 'left' | 'right' | 'center'
  render?: (row: T) => React.ReactNode
  className?: string
}

type ReportTableProps<T> = {
  columns: ColumnDef<T>[]
  rows: T[]
  getKey: (row: T) => string | number
  stickyHeader?: boolean
  className?: string
  emptyText?: string
}

export function ReportTable<T>({
  columns,
  rows,
  getKey,
  stickyHeader = false,
  className,
  emptyText = 'Sem dados para o periodo selecionado',
}: ReportTableProps<T>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-[500px] text-[12px]">
        <thead>
          <tr className={cn(stickyHeader && 'sticky top-0 z-10 bg-bg')}>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  'pb-2.5 border-b border-night-lighter font-medium uppercase tracking-[0.07em] text-[10px] text-stone',
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                  col.className
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-stone tracking-tight">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getKey(row)} className="border-b border-night-lighter/50 hover:bg-night-light/20 transition-colors">
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={cn(
                      'py-2.5 text-cloud tracking-tight',
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      col.className
                    )}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[String(col.key)] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
