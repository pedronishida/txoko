'use client'

import { cn, formatCurrency } from '@/lib/utils'
import { ReportCard } from '@/components/reports/report-card'
import { ReportTable, type ColumnDef } from '@/components/reports/report-table'
import { SimpleBarChart } from '@/components/reports/simple-bar-chart'
import { DateRangePicker } from '@/components/reports/date-range-picker'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProductABC } from './page'

type BarPoint = { label: string; value: number; secondaryValue?: number }

type Props = {
  products: ProductABC[]
  slowMovers: ProductABC[]
  paretoData: BarPoint[]
  totalRevenue: number
  defaultFrom: string
  defaultTo: string
}

function ClassBadge({ cls }: { cls: 'A' | 'B' | 'C' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-medium font-data',
        cls === 'A' && 'bg-leaf/20 text-leaf',
        cls === 'B' && 'bg-warm/20 text-warm',
        cls === 'C' && 'bg-stone-dark/30 text-stone-light'
      )}
    >
      {cls}
    </span>
  )
}

const COLUMNS: ColumnDef<ProductABC>[] = [
  {
    key: 'classBadge',
    label: 'Classe',
    align: 'center',
    className: 'w-14',
    render: (row) => <ClassBadge cls={row.classBadge} />,
  },
  {
    key: 'name',
    label: 'Produto',
    render: (row) => (
      <div>
        <span className="text-cloud tracking-tight">{row.name}</span>
        {row.category && row.category !== '-' && (
          <span className="block text-[10px] text-stone-dark mt-0.5">{row.category}</span>
        )}
      </div>
    ),
  },
  {
    key: 'qty',
    label: 'Qtd',
    align: 'right',
    render: (row) => <span className="font-data">{row.qty.toLocaleString('pt-BR')}</span>,
  },
  {
    key: 'revenue',
    label: 'Receita',
    align: 'right',
    render: (row) => <span className="font-data text-cloud">{formatCurrency(row.revenue)}</span>,
  },
  {
    key: 'cmv',
    label: 'CMV',
    align: 'right',
    render: (row) => <span className="font-data text-stone-dark">{formatCurrency(row.cmv)}</span>,
  },
  {
    key: 'marginPct',
    label: 'Margem',
    align: 'right',
    render: (row) => (
      <span
        className={cn(
          'font-data',
          row.marginPct >= 60
            ? 'text-leaf'
            : row.marginPct >= 30
            ? 'text-warm'
            : 'text-coral'
        )}
      >
        {row.marginPct.toFixed(1)}%
      </span>
    ),
  },
  {
    key: 'cumulativePct',
    label: '% Acum.',
    align: 'right',
    render: (row) => (
      <span className="font-data text-stone-dark">{row.cumulativePct.toFixed(1)}%</span>
    ),
  },
]

export function ProdutosRelatorioView({
  products,
  slowMovers,
  paretoData,
  totalRevenue,
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

  const classA = products.filter((p) => p.classBadge === 'A')
  const classB = products.filter((p) => p.classBadge === 'B')
  const classC = products.filter((p) => p.classBadge === 'C')

  // Margin analysis: sorted by margin desc
  const byMargin = [...products].sort((a, b) => b.marginPct - a.marginPct)

  // Highlights
  const lowMarginHighVol = [...products]
    .filter((p) => p.marginPct < 30 && p.qty >= 10)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)
  const highMarginLowVol = [...products]
    .filter((p) => p.marginPct >= 60 && p.qty < 10)
    .sort((a, b) => b.marginPct - a.marginPct)
    .slice(0, 5)

  return (
    <div className="space-y-10">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 print:hidden">
        <DateRangePicker value={range} onChange={handleRangeChange} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportCard
          label="Produtos Ativos"
          value={String(products.length)}
          sub="Com vendas no periodo"
        />
        <ReportCard
          label="Classe A"
          value={String(classA.length)}
          sub="80% da receita"
          tone="positive"
        />
        <ReportCard
          label="Classe B"
          value={String(classB.length)}
          sub="15% da receita"
          tone="warn"
        />
        <ReportCard
          label="Baixo Giro"
          value={String(slowMovers.length)}
          sub="Menos de 5 vendas"
          tone="negative"
        />
      </div>

      {/* Pareto chart */}
      {paretoData.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-2">
            Curva de Pareto — Receita acumulada por produto
          </h2>
          <p className="text-[11px] text-stone-dark mb-4">
            Eixo: produtos ordenados por receita (esq → dir). Barras = receita individual. Linha = acumulado %.
          </p>
          <SimpleBarChart
            data={paretoData.map((d) => ({ label: d.label, value: d.value }))}
            height={160}
            formatValue={formatCurrency}
          />
          {/* Cumulative % line approximation as text */}
          <div className="flex justify-between text-[10px] font-data text-stone-dark mt-2 px-1">
            <span>0%</span>
            <span className="text-leaf">Classe A ≤ 80%</span>
            <span className="text-warm">B ≤ 95%</span>
            <span>100%</span>
          </div>
        </section>
      )}

      {/* ABC Table */}
      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
          Analise ABC — Todos os produtos
        </h2>
        <ReportTable
          columns={COLUMNS}
          rows={products}
          getKey={(r) => r.id}
          stickyHeader
        />
      </section>

      {/* Margin insights */}
      {(lowMarginHighVol.length > 0 || highMarginLowVol.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {lowMarginHighVol.length > 0 && (
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-1">
                Alta Volume, Baixa Margem
              </h2>
              <p className="text-[11px] text-stone-dark mb-4">
                Produtos com alto giro mas margem abaixo de 30% — revisar custo ou preco.
              </p>
              <div className="divide-y divide-night-lighter">
                {lowMarginHighVol.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-[12px] text-cloud tracking-tight block truncate">{p.name}</span>
                      <span className="text-[10px] text-stone-dark">{p.qty} vendas</span>
                    </div>
                    <span className="text-[12px] font-data text-coral shrink-0">
                      {p.marginPct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {highMarginLowVol.length > 0 && (
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-1">
                Alta Margem, Baixo Volume
              </h2>
              <p className="text-[11px] text-stone-dark mb-4">
                Oportunidade de upsell — margem acima de 60% mas poucas vendas.
              </p>
              <div className="divide-y divide-night-lighter">
                {highMarginLowVol.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-[12px] text-cloud tracking-tight block truncate">{p.name}</span>
                      <span className="text-[10px] text-stone-dark">{p.qty} vendas</span>
                    </div>
                    <span className="text-[12px] font-data text-leaf shrink-0">
                      {p.marginPct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Slow movers */}
      {slowMovers.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-1">
            Baixo Giro — Menos de 5 vendas no periodo
          </h2>
          <p className="text-[11px] text-stone-dark mb-4">
            {slowMovers.length} produto(s) com poucas vendas. Considere remover do cardapio ou promover.
          </p>
          <ReportTable
            columns={[
              { key: 'name', label: 'Produto' },
              {
                key: 'qty',
                label: 'Vendas',
                align: 'right',
                render: (row) => <span className="font-data text-coral">{row.qty}</span>,
              },
              {
                key: 'revenue',
                label: 'Receita',
                align: 'right',
                render: (row) => <span className="font-data">{formatCurrency(row.revenue)}</span>,
              },
              {
                key: 'classBadge',
                label: 'Classe',
                align: 'center',
                render: (row) => <ClassBadge cls={row.classBadge} />,
              },
            ]}
            rows={slowMovers}
            getKey={(r) => r.id}
          />
        </section>
      )}
    </div>
  )
}
