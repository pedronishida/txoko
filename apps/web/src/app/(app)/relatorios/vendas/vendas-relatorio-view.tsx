'use client'

import { formatCurrency } from '@/lib/utils'
import { ReportCard } from '@/components/reports/report-card'
import { SimpleBarChart } from '@/components/reports/simple-bar-chart'
import { SimplePieChart } from '@/components/reports/simple-pie-chart'
import { Heatmap } from '@/components/reports/heatmap'
import { ReportTable } from '@/components/reports/report-table'
import { DateRangePicker } from '@/components/reports/date-range-picker'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type DayPoint = { date: string; label: string; revenue: number; count: number }

type Props = {
  totalRevenue: number
  orderCount: number
  avgTicket: number
  dailySeries: DayPoint[]
  heatmapData: number[][]
  heatmapRowLabels: string[]
  heatmapColLabels: string[]
  byType: Record<string, number>
  byMethod: Record<string, number>
  topDays: DayPoint[]
  defaultFrom: string
  defaultTo: string
}

const TYPE_LABELS: Record<string, string> = {
  dine_in: 'Mesa',
  takeaway: 'Retirada',
  delivery: 'Delivery',
  balcao: 'Balcao',
  ifood: 'iFood',
  whatsapp: 'WhatsApp',
  cardapio: 'Cardapio',
  other: 'Outros',
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Credito',
  debit: 'Debito',
  pix: 'PIX',
  voucher: 'Voucher',
  online: 'Online',
}

const PIE_COLORS_TYPE = ['#4ADE80', '#F59E0B', '#60A5FA', '#F472B6', '#A78BFA']
const PIE_COLORS_METHOD = ['#4ADE80', '#60A5FA', '#F59E0B', '#F472B6', '#34D399', '#FB923C']

export function VendasRelatorioView({
  totalRevenue,
  orderCount,
  avgTicket,
  dailySeries,
  heatmapData,
  heatmapRowLabels,
  heatmapColLabels,
  byType,
  byMethod,
  topDays,
  defaultFrom,
  defaultTo,
}: Props) {
  const router = useRouter()
  const [range, setRange] = useState({ from: defaultFrom, to: defaultTo })

  function handleRangeChange(newRange: { from: string; to: string }) {
    setRange(newRange)
    const url = new URL(window.location.href)
    url.searchParams.set('from', newRange.from)
    url.searchParams.set('to', newRange.to)
    router.push(url.pathname + url.search)
  }

  const typeSlices = Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value], i) => ({
      label: TYPE_LABELS[key] ?? key,
      value,
      color: PIE_COLORS_TYPE[i % PIE_COLORS_TYPE.length],
    }))

  const methodSlices = Object.entries(byMethod)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value], i) => ({
      label: METHOD_LABELS[key] ?? key,
      value,
      color: PIE_COLORS_METHOD[i % PIE_COLORS_METHOD.length],
    }))

  const topDaysSorted = [...topDays].sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="space-y-10">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 print:hidden">
        <DateRangePicker value={range} onChange={handleRangeChange} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <ReportCard label="Receita Total" value={formatCurrency(totalRevenue)} />
        <ReportCard
          label="Total Pedidos"
          value={orderCount.toLocaleString('pt-BR')}
          sub="No periodo selecionado"
        />
        <ReportCard
          label="Ticket Medio"
          value={formatCurrency(avgTicket)}
          sub="Por pedido"
        />
      </div>

      {/* Daily bar chart */}
      {dailySeries.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
            Vendas Diarias
          </h2>
          <SimpleBarChart
            data={dailySeries.map((d) => ({ label: d.label, value: d.revenue }))}
            height={180}
            formatValue={formatCurrency}
          />
        </section>
      )}

      {/* Heatmap */}
      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
          Vendas por Horario (Receita por dia × hora)
        </h2>
        <Heatmap
          data={heatmapData}
          rowLabels={heatmapRowLabels}
          colLabels={heatmapColLabels}
          formatValue={formatCurrency}
        />
      </section>

      {/* Pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
            Vendas por Tipo / Canal
          </h2>
          {typeSlices.length > 0 ? (
            <SimplePieChart data={typeSlices} formatValue={formatCurrency} />
          ) : (
            <p className="text-[12px] text-stone">Sem dados no periodo</p>
          )}
        </section>

        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
            Forma de Pagamento
          </h2>
          {methodSlices.length > 0 ? (
            <SimplePieChart data={methodSlices} formatValue={formatCurrency} />
          ) : (
            <p className="text-[12px] text-stone">Sem pagamentos aprovados no periodo</p>
          )}
        </section>
      </div>

      {/* Top 10 days table */}
      {topDaysSorted.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
            Top 10 Melhores Dias
          </h2>
          <ReportTable
            columns={[
              {
                key: 'rank',
                label: '#',
                align: 'center',
                className: 'w-10',
                render: (_row) => {
                  const idx = topDaysSorted.indexOf(_row as DayPoint)
                  return <span className="text-stone-dark font-data">{idx + 1}</span>
                },
              },
              {
                key: 'date',
                label: 'Data',
                render: (row) => {
                  const r = row as DayPoint
                  return (
                    <span className="font-data">
                      {new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                      })}
                    </span>
                  )
                },
              },
              {
                key: 'count',
                label: 'Pedidos',
                align: 'right',
                render: (row) => <span className="font-data">{(row as DayPoint).count}</span>,
              },
              {
                key: 'revenue',
                label: 'Receita',
                align: 'right',
                render: (row) => (
                  <span className="font-data text-leaf">{formatCurrency((row as DayPoint).revenue)}</span>
                ),
              },
            ]}
            rows={topDaysSorted}
            getKey={(row) => row.date}
          />
        </section>
      )}
    </div>
  )
}
