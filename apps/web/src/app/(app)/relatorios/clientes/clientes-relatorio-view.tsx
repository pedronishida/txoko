'use client'

import { cn, formatCurrency } from '@/lib/utils'
import { ReportCard } from '@/components/reports/report-card'
import { ReportTable } from '@/components/reports/report-table'
import { SimpleBarChart } from '@/components/reports/simple-bar-chart'
import type { RFMCustomer } from './page'

type Props = {
  rfmCustomers: RFMCustomer[]
  segments: Record<string, number>
  top20: RFMCustomer[]
  ltvDist: { label: string; count: number }[]
  churn30: number
  churn60: number
  churn90: number
  newCustomersCount: number
  monthlyNewSeries: { label: string; value: number }[]
  totalCustomers: number
}

const SEGMENT_CONFIG: Record<
  RFMCustomer['segment'],
  { label: string; color: string; bg: string; desc: string }
> = {
  champion: {
    label: 'Campeoes',
    color: 'text-leaf',
    bg: 'bg-leaf/20',
    desc: 'Compraram recentemente, com frequencia e alto valor',
  },
  loyal: {
    label: 'Fieis',
    color: 'text-warm',
    bg: 'bg-warm/20',
    desc: 'Compram regularmente, bom relacionamento',
  },
  at_risk: {
    label: 'Em Risco',
    color: 'text-coral',
    bg: 'bg-coral/20',
    desc: 'Costumavam comprar mas estao sumindo',
  },
  lost: {
    label: 'Perdidos',
    color: 'text-stone',
    bg: 'bg-stone/20',
    desc: 'Nao compram ha mais de 60 dias',
  },
  new: {
    label: 'Novos',
    color: 'text-blue-400',
    bg: 'bg-blue-400/20',
    desc: 'Primeira compra recente, nutrir relacionamento',
  },
}

function SegmentBadge({ segment }: { segment: RFMCustomer['segment'] }) {
  const cfg = SEGMENT_CONFIG[segment]
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', cfg.bg, cfg.color)}>
      {cfg.label}
    </span>
  )
}

export function ClientesRelatorioView({
  rfmCustomers,
  segments,
  top20,
  ltvDist,
  churn30,
  churn60,
  churn90,
  newCustomersCount,
  monthlyNewSeries,
  totalCustomers,
}: Props) {
  const maxLtv = Math.max(1, ...ltvDist.map((b) => b.count))

  return (
    <div className="space-y-10">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportCard
          label="Clientes com Compras"
          value={totalCustomers.toLocaleString('pt-BR')}
          sub="Com pedidos nos ultimos 3 meses"
        />
        <ReportCard
          label="Novos (30 dias)"
          value={newCustomersCount.toLocaleString('pt-BR')}
          sub="Cadastros recentes"
          tone="positive"
        />
        <ReportCard
          label="Em Risco"
          value={String(segments['at_risk'] ?? 0)}
          sub="Sem comprar 30–60 dias"
          tone="warn"
        />
        <ReportCard
          label="Perdidos"
          value={String(segments['lost'] ?? 0)}
          sub="Sem comprar ha 60+ dias"
          tone="negative"
        />
      </div>

      {/* Segments + Churn */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* RFM Segments */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
            Segmentos RFM
          </h2>
          <div className="space-y-4">
            {(Object.keys(SEGMENT_CONFIG) as RFMCustomer['segment'][]).map((seg) => {
              const cfg = SEGMENT_CONFIG[seg]
              const count = segments[seg] ?? 0
              const pct = totalCustomers > 0 ? (count / totalCustomers) * 100 : 0
              return (
                <div key={seg}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className={cn('text-[12px] font-medium tracking-tight', cfg.color)}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-stone-dark ml-2">{cfg.desc}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-data text-cloud">{count}</span>
                      <span className="text-[10px] font-data text-stone-dark">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-1 w-full bg-night-lighter rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all')}
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          seg === 'champion'
                            ? '#4ADE80'
                            : seg === 'loyal'
                            ? '#F59E0B'
                            : seg === 'at_risk'
                            ? '#EF4444'
                            : seg === 'lost'
                            ? '#78716C'
                            : '#60A5FA',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Churn rates */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
            Taxa de Churn
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone mb-1">30 dias</p>
              <p className={cn('text-[24px] font-data font-medium', churn30 > 50 ? 'text-coral' : 'text-warm')}>
                {churn30.toFixed(0)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone mb-1">60 dias</p>
              <p className={cn('text-[24px] font-data font-medium', churn60 > 60 ? 'text-coral' : 'text-warm')}>
                {churn60.toFixed(0)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone mb-1">90 dias</p>
              <p className={cn('text-[24px] font-data font-medium', churn90 > 70 ? 'text-coral' : 'text-warm')}>
                {churn90.toFixed(0)}%
              </p>
            </div>
          </div>
          <p className="text-[11px] text-stone-dark leading-relaxed">
            % de clientes que nao realizaram nenhuma compra dentro do periodo. Meta saudavel: abaixo de 40% em 60 dias.
          </p>

          {/* LTV distribution */}
          <div className="mt-6">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-3">
              Distribuicao de LTV
            </h3>
            <div className="space-y-2">
              {ltvDist.map((bucket) => (
                <div key={bucket.label} className="flex items-center gap-3">
                  <span className="text-[10px] font-data text-stone-dark w-20 shrink-0">
                    {bucket.label}
                  </span>
                  <div className="flex-1 h-4 bg-night-lighter rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-leaf/60 rounded-sm transition-all"
                      style={{ width: `${(bucket.count / maxLtv) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-data text-stone-light w-6 text-right">
                    {bucket.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Monthly new customers */}
      {monthlyNewSeries.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
            Novos Clientes por Mes
          </h2>
          <SimpleBarChart
            data={monthlyNewSeries}
            height={140}
            formatValue={(v) => `${v} clientes`}
          />
        </section>
      )}

      {/* RFM Scatter approximation as table */}
      {rfmCustomers.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-2">
            Mapa RFM — Recencia vs Valor
          </h2>
          <p className="text-[11px] text-stone-dark mb-4">
            Cada linha e um cliente. Recencia (dias desde ultima compra), Frequencia (pedidos) e Valor total.
          </p>
          {/* Simple scatter as colored table rows sorted by monetary */}
          <div className="overflow-x-auto">
            <div className="grid grid-cols-4 gap-1 min-w-[300px]">
              {/* Header */}
              <span className="text-[10px] text-stone uppercase tracking-[0.06em] pb-2">Segmento</span>
              <span className="text-[10px] text-stone uppercase tracking-[0.06em] pb-2 text-right">Recencia</span>
              <span className="text-[10px] text-stone uppercase tracking-[0.06em] pb-2 text-right">Freq.</span>
              <span className="text-[10px] text-stone uppercase tracking-[0.06em] pb-2 text-right">Valor</span>
              {rfmCustomers.slice(0, 30).map((c) => (
                <>
                  <span key={`${c.id}-seg`} className="py-1.5 border-t border-night-lighter/50">
                    <SegmentBadge segment={c.segment} />
                  </span>
                  <span
                    key={`${c.id}-rec`}
                    className="py-1.5 border-t border-night-lighter/50 font-data text-[11px] text-stone-light text-right"
                  >
                    {c.recencyDays}d
                  </span>
                  <span
                    key={`${c.id}-freq`}
                    className="py-1.5 border-t border-night-lighter/50 font-data text-[11px] text-stone-light text-right"
                  >
                    {c.frequency}
                  </span>
                  <span
                    key={`${c.id}-mon`}
                    className="py-1.5 border-t border-night-lighter/50 font-data text-[11px] text-cloud text-right"
                  >
                    {formatCurrency(c.monetary)}
                  </span>
                </>
              ))}
            </div>
            {rfmCustomers.length > 30 && (
              <p className="text-[10px] text-stone-dark mt-3">
                Mostrando 30 de {rfmCustomers.length} clientes. Use export PDF para ver todos.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Top 20 customers */}
      {top20.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-4">
            Top 20 Clientes por Valor Total
          </h2>
          <ReportTable
            columns={[
              {
                key: 'name',
                label: 'Cliente',
                render: (row) => (
                  <div>
                    <span className="text-cloud tracking-tight">{row.name}</span>
                    {row.phone && (
                      <span className="block text-[10px] text-stone-dark font-data">{row.phone}</span>
                    )}
                  </div>
                ),
              },
              {
                key: 'segment',
                label: 'Segmento',
                render: (row) => <SegmentBadge segment={row.segment} />,
              },
              {
                key: 'frequency',
                label: 'Pedidos',
                align: 'right',
                render: (row) => <span className="font-data">{row.frequency}</span>,
              },
              {
                key: 'monetary',
                label: 'Total Gasto',
                align: 'right',
                render: (row) => (
                  <span className="font-data text-cloud">{formatCurrency(row.monetary)}</span>
                ),
              },
              {
                key: 'lastVisit',
                label: 'Ultima Visita',
                align: 'right',
                render: (row) => (
                  <span className="font-data text-stone-dark text-[11px]">
                    {row.lastVisit
                      ? new Date(row.lastVisit).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })
                      : '—'}
                  </span>
                ),
              },
            ]}
            rows={top20}
            getKey={(r) => r.id}
          />
        </section>
      )}
    </div>
  )
}
