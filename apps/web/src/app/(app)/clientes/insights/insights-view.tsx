'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type CustomerInsight = {
  customer_id: string
  name: string | null
  phone: string | null
  email: string | null
  total_orders: number
  total_spent: number
  last_visit_at: string | null
  churn_risk: number
  engagement_score: number
}

type InsightsTab = 'top' | 'churn' | 'engaged' | 'inactive'

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

function daysSince(value: string | null) {
  return value ? Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)) : null
}

function formatLastVisit(value: string | null) {
  if (!value) return 'nunca'
  const days = daysSince(value)
  return days === null
    ? 'nunca'
    : days === 0
      ? 'hoje'
      : days === 1
        ? 'ontem'
        : days < 30
          ? `${days}d`
          : days < 365
            ? `${Math.floor(days / 30)}m`
            : `${Math.floor(days / 365)}a`
}

export function ClientesInsightsView({ insights }: { insights: CustomerInsight[] }) {
  const [tab, setTab] = useState<InsightsTab>('top')

  const summary = useMemo(() => {
    const total = insights.length
    const vip = insights.filter((row) => row.total_spent >= 500)
    const atRisk = insights.filter((row) => row.churn_risk >= 70 && row.total_orders > 0)
    const totalLtv = insights.reduce((sum, row) => sum + row.total_spent, 0)
    const avgEngagement =
      total > 0 ? insights.reduce((sum, row) => sum + row.engagement_score, 0) / total : 0
    return {
      totalCustomers: total,
      vipCount: vip.length,
      atRiskCount: atRisk.length,
      totalLtv,
      avgEngagement: Math.round(avgEngagement),
    }
  }, [insights])

  const lists = useMemo(
    () => ({
      top: [...insights].sort((a, b) => b.total_spent - a.total_spent).slice(0, 25),
      churn: insights
        .filter((row) => row.churn_risk >= 70 && row.total_orders > 0)
        .sort((a, b) => b.churn_risk - a.churn_risk)
        .slice(0, 25),
      engaged: [...insights]
        .sort((a, b) => b.engagement_score - a.engagement_score)
        .slice(0, 25),
      inactive: insights
        .filter((row) => {
          const days = daysSince(row.last_visit_at)
          return row.total_orders > 0 && days !== null && days > 30
        })
        .sort((a, b) => {
          const daysA = daysSince(a.last_visit_at) ?? 0
          return (daysSince(b.last_visit_at) ?? 0) - daysA
        })
        .slice(0, 25),
    }),
    [insights]
  )

  const tabs: { key: InsightsTab; label: string }[] = [
    { key: 'top', label: `Top LTV (${lists.top.length})` },
    { key: 'churn', label: `Em risco (${lists.churn.length})` },
    { key: 'engaged', label: `Mais engajados (${lists.engaged.length})` },
    { key: 'inactive', label: `Inativos >30d (${lists.inactive.length})` },
  ]
  const rows = lists[tab]

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-5">
          Visao geral
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-8 gap-y-6">
          <Stat label="Total de clientes" value={String(summary.totalCustomers)} />
          <Stat label="VIP (LTV ≥ R$ 500)" value={String(summary.vipCount)} tone="leaf" />
          <Stat
            label="Em risco de churn"
            value={String(summary.atRiskCount)}
            tone={summary.atRiskCount > 0 ? 'warm' : 'neutral'}
          />
          <Stat label="Engajamento medio" value={`${summary.avgEngagement}%`} />
          <Stat label="LTV total" value={currency.format(summary.totalLtv)} />
        </div>
      </section>

      <section>
        <div className="flex gap-5 pb-3 mb-5 border-b border-border overflow-x-auto scrollbar-none">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative text-[12px] tracking-tight whitespace-nowrap pb-3 -mb-3 transition-colors',
                tab === t.key
                  ? 'text-foreground font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-success after:rounded-full'
                  : 'text-muted hover:text-foreground/70'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted tracking-tight">
            Nenhum cliente nesse criterio.
          </p>
        ) : (
          <div>
            <div className="grid grid-cols-[2fr_100px_100px_100px_120px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
              <span>Cliente</span>
              <span className="text-right">Pedidos</span>
              <span className="text-right">LTV</span>
              <span className="text-right">Ultima visita</span>
              <span className="text-right">
                {tab === 'churn' ? 'Risco churn' : tab === 'engaged' ? 'Engajamento' : 'Status'}
              </span>
            </div>
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {rows.map((row) => {
                const isVip = row.total_spent >= 500
                const isAtRisk = row.churn_risk >= 70
                return (
                  <Link
                    key={row.customer_id}
                    href={`/clientes?id=${row.customer_id}`}
                    className="grid grid-cols-[2fr_100px_100px_100px_120px] gap-4 py-3 items-center hover:bg-muted-subtle/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] text-foreground tracking-tight truncate">
                        {row.name ?? 'Anonimo'}
                        {isVip && (
                          <span className="ml-2 text-[9px] uppercase tracking-[0.08em] text-success bg-success/10 px-1.5 py-0.5 rounded">
                            VIP
                          </span>
                        )}
                      </p>
                      {row.phone && <p className="text-[10px] font-data text-muted">{row.phone}</p>}
                    </div>
                    <span className="text-[12px] font-data text-foreground/75 text-right">
                      {row.total_orders}
                    </span>
                    <span
                      className={cn(
                        'text-[12px] font-data text-right',
                        isVip ? 'text-success' : 'text-foreground'
                      )}
                    >
                      {currency.format(row.total_spent)}
                    </span>
                    <span className="text-[11px] font-data text-muted text-right">
                      {formatLastVisit(row.last_visit_at)}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-data text-right',
                        tab === 'churn' && isAtRisk
                          ? 'text-accent-foreground'
                          : tab === 'engaged'
                            ? 'text-foreground'
                            : 'text-muted'
                      )}
                    >
                      {tab === 'churn'
                        ? `${row.churn_risk}%`
                        : tab === 'engaged'
                          ? `${row.engagement_score}%`
                          : isAtRisk
                            ? 'em risco'
                            : row.total_orders > 0
                              ? 'ativo'
                              : 'novo'}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted tracking-tight">
        Dados calculados em tempo real via view <code>customer_metrics</code> (Fase 4 do
        roadmap). Churn risk e engagement score sao atualizados por modelos noturnos no cron.
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'leaf' | 'warm'
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p
        className={cn(
          'text-[22px] font-medium tracking-[-0.03em] leading-none font-data mt-3',
          tone === 'leaf' && 'text-success',
          tone === 'warm' && 'text-accent-foreground',
          tone === 'neutral' && 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  )
}
