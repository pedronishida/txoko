'use client'

import { cn, formatCurrency } from '@/lib/utils'
import { ReportCard } from '@/components/reports/report-card'
import { SimpleBarChart } from '@/components/reports/simple-bar-chart'
import { DateRangePicker, presetToRange } from '@/components/reports/date-range-picker'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type DailySeries = { date: string; label: string; revenue: number; expenses: number }
type ExpCat = { cat: string; amount: number }

type Props = {
  revenue: number
  subtotalSum: number
  serviceFeeSum: number
  deliveryFeeSum: number
  cmv: number
  grossProfit: number
  totalExpenses: number
  taxes: number
  fixedCosts: number
  otherExpenses: number
  operatingProfit: number
  netProfit: number
  netMargin: number
  dailySeries: DailySeries[]
  bySource: Record<string, number>
  expenseCategories: ExpCat[]
  defaultFrom: string
  defaultTo: string
  restaurantId: string
}

const SOURCE_LABELS: Record<string, string> = {
  balcao: 'Balcao',
  delivery: 'Delivery',
  ifood: 'iFood',
  whatsapp: 'WhatsApp',
  cardapio: 'Cardapio publico',
  takeaway: 'Retirada',
}

const CAT_LABELS: Record<string, string> = {
  pessoal: 'Pessoal',
  aluguel: 'Aluguel',
  marketing: 'Marketing',
  utilidades: 'Utilidades',
  impostos: 'Impostos',
  outros: 'Outros',
}

type DreRow = { label: string; value: number; bold?: boolean; indent: number; highlight?: boolean; sub?: boolean }

export function FinanceiroRelatorioView({
  revenue,
  subtotalSum,
  serviceFeeSum,
  deliveryFeeSum,
  cmv,
  grossProfit,
  totalExpenses,
  taxes,
  fixedCosts,
  otherExpenses,
  operatingProfit,
  netProfit,
  netMargin,
  dailySeries,
  bySource,
  expenseCategories,
  defaultFrom,
  defaultTo,
}: Props) {
  const router = useRouter()
  const [range, setRange] = useState({ from: defaultFrom, to: defaultTo })

  function handleRangeChange(newRange: { from: string; to: string }) {
    setRange(newRange)
    // Trigger server re-fetch via router refresh with search params
    const url = new URL(window.location.href)
    url.searchParams.set('from', newRange.from)
    url.searchParams.set('to', newRange.to)
    router.push(url.pathname + url.search)
  }

  const dreRows: DreRow[] = [
    { label: 'Receita Bruta', value: revenue, bold: true, indent: 0 },
    { label: '(-) Taxas de servico', value: -serviceFeeSum, indent: 1, sub: true },
    { label: '(-) Taxas de entrega', value: -deliveryFeeSum, indent: 1, sub: true },
    { label: '= Receita Liquida', value: subtotalSum, bold: true, indent: 0 },
    { label: '(-) CMV estimado', value: -cmv, indent: 1, sub: true },
    { label: '= Lucro Bruto', value: grossProfit, bold: true, indent: 0 },
    { label: '(-) Despesas operacionais', value: -totalExpenses, indent: 1, sub: true },
    { label: '= Lucro Operacional', value: operatingProfit, bold: true, indent: 0 },
    { label: '(-) Despesas fixas', value: -fixedCosts, indent: 1, sub: true },
    { label: '(-) Impostos', value: -taxes, indent: 1, sub: true },
    { label: '(-) Outras despesas', value: -otherExpenses, indent: 1, sub: true },
    {
      label: '= Lucro Liquido',
      value: netProfit,
      bold: true,
      indent: 0,
      highlight: true,
    },
  ]

  const chartData = dailySeries.map((d) => ({
    label: d.label,
    value: d.revenue,
    secondaryValue: d.expenses,
  }))

  const sourceEntries = Object.entries(bySource).sort(([, a], [, b]) => b - a)

  return (
    <div className="space-y-10 print:space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 print:hidden">
        <DateRangePicker
          value={range}
          onChange={handleRangeChange}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportCard
          label="Receita Bruta"
          value={formatCurrency(revenue)}
          sub={`${Object.values(bySource).length > 1 ? Object.keys(bySource).map((s) => SOURCE_LABELS[s] ?? s).join(', ') : 'Vendas'}`}
        />
        <ReportCard
          label="Lucro Bruto"
          value={formatCurrency(grossProfit)}
          sub={`CMV: ${formatCurrency(cmv)}`}
          tone={grossProfit >= 0 ? 'positive' : 'negative'}
        />
        <ReportCard
          label="Despesas Totais"
          value={formatCurrency(totalExpenses)}
          sub={`${expenseCategories.length} categorias`}
          tone="warn"
        />
        <ReportCard
          label="Lucro Liquido"
          value={formatCurrency(netProfit)}
          sub={`Margem: ${netMargin.toFixed(1)}%`}
          tone={netProfit >= 0 ? 'positive' : 'negative'}
        />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <section>
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Receita e Despesas Diarias
            </h2>
            <div className="flex items-center gap-4 text-[10px] text-stone-dark">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-leaf" />
                Receita
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-warm" />
                Despesas
              </span>
            </div>
          </div>
          <SimpleBarChart
            data={chartData}
            height={180}
            formatValue={formatCurrency}
            showSecondary
          />
        </section>
      )}

      {/* DRE + Expenses side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* DRE */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
            DRE Detalhado
          </h2>
          <div className="divide-y divide-night-lighter">
            {dreRows.map((row, i) => (
              <div
                key={i}
                className={cn(
                  'py-2.5 flex items-baseline justify-between',
                  row.highlight && 'bg-night-light/40 -mx-4 px-4 rounded'
                )}
              >
                <span
                  className={cn(
                    'tracking-tight',
                    row.bold ? 'text-[13px] text-cloud font-medium' : 'text-[12px] text-stone-light'
                  )}
                  style={{ paddingLeft: `${row.indent * 14}px` }}
                >
                  {row.label}
                </span>
                <span
                  className={cn(
                    'font-data shrink-0',
                    row.highlight ? 'text-[14px] text-cloud font-medium' : 'text-[12px]',
                    !row.highlight && row.value < 0 && 'text-coral/80',
                    !row.highlight && row.value >= 0 && row.bold && 'text-cloud',
                    !row.highlight && row.value >= 0 && !row.bold && 'text-stone-light'
                  )}
                >
                  {row.value < 0
                    ? `(${formatCurrency(Math.abs(row.value))})`
                    : formatCurrency(row.value)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-stone-dark tracking-tight mt-3">
            Margem liquida: <span className={cn('font-data', netMargin >= 0 ? 'text-leaf' : 'text-coral')}>{netMargin.toFixed(1)}%</span>
          </p>
        </section>

        {/* Right column: sources + expenses */}
        <div className="space-y-8">
          {/* Revenue by source */}
          {sourceEntries.length > 0 && (
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
                Receita por Canal
              </h2>
              <div className="space-y-3">
                {sourceEntries.map(([src, amount]) => (
                  <div key={src}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[12px] text-cloud tracking-tight">
                        {SOURCE_LABELS[src] ?? src}
                      </span>
                      <div className="flex gap-3 items-baseline">
                        <span className="text-[12px] font-data text-cloud">{formatCurrency(amount)}</span>
                        <span className="text-[10px] font-data text-stone-dark w-8 text-right">
                          {revenue > 0 ? Math.round((amount / revenue) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                    <div className="h-0.5 w-full bg-night-lighter rounded-full overflow-hidden">
                      <div
                        className="h-full bg-leaf/70 rounded-full"
                        style={{ width: `${revenue > 0 ? (amount / revenue) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Expenses by category */}
          {expenseCategories.length > 0 && (
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
                Despesas por Categoria
              </h2>
              <div className="space-y-3">
                {expenseCategories.map(({ cat, amount }) => (
                  <div key={cat}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[12px] text-cloud tracking-tight">
                        {CAT_LABELS[cat] ?? cat}
                      </span>
                      <div className="flex gap-3 items-baseline">
                        <span className="text-[12px] font-data text-cloud">{formatCurrency(amount)}</span>
                        <span className="text-[10px] font-data text-stone-dark w-8 text-right">
                          {totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                    <div className="h-0.5 w-full bg-night-lighter rounded-full overflow-hidden">
                      <div
                        className="h-full bg-warm/70 rounded-full"
                        style={{ width: `${totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
