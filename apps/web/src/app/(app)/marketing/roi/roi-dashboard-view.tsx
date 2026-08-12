'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { RoiCostBreakdown } from './roi-cost'

export type RoiSummary = {
  revenue_attributed: number
  orders_attributed: number
  revenue_ai_agent: number
  revenue_campaign: number
  revenue_menu_session: number
  cost_total: number
  cost_breakdown: RoiCostBreakdown
  roas: number | null
  recipients_sent: number
  recipients_delivered: number
  link_clicks: number
  menu_sessions: number
  menu_with_cart: number
  menu_submitted: number
  menu_abandoned: number
  ai_drafts_total: number
  ai_drafts_confirmed: number
  ai_drafts_cancelled: number
  ai_drafts_building: number
  ai_drafts_expired: number
}

export type RoiChannelBreakdown = {
  channel: string
  recipients_sent: number
  recipients_delivered: number
  link_clicks: number
  unique_clicks: number
  cost_brl: number
  campaigns_count: number
}

export type RoiCampaignRow = {
  id: string
  name: string
  channel: string
  status: string
  recipients_delivered: number
  unique_clicks: number
  orders_attributed: number
  revenue_attributed: number
}

export type RoiSourceRow = {
  source: string
  sessions: number
  with_cart: number
  submitted: number
  abandoned: number
  revenue_brl: number
}

export type RoiRecentOrder = {
  id: string
  total: number
  source: string
  origin: 'ai_agent' | 'campaign' | 'menu_session' | 'other'
  origin_label: string
  customer_name: string | null
  created_at: string
}

type Props = {
  periodDays: number
  summary: RoiSummary
  channelBreakdown: RoiChannelBreakdown[]
  campaignRows: RoiCampaignRow[]
  sourceRows: RoiSourceRow[]
  recentOrders: RoiRecentOrder[]
}

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direto',
  campaign: 'Campanha',
  inbox: 'Inbox',
  menu_share: 'Compartilhado',
  qr_table: 'QR mesa',
  organic: 'Organico',
  automation: 'Automacao',
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  sms: 'SMS',
}

const ORIGIN_META: Record<string, { label: string; tone: string }> = {
  ai_agent: { label: 'Agente IA', tone: 'text-success' },
  campaign: { label: 'Campanha', tone: 'text-foreground' },
  menu_session: { label: 'Cardapio', tone: 'text-foreground/75' },
  other: { label: 'Outro', tone: 'text-muted' },
}

export function RoiDashboardView({
  periodDays,
  summary,
  channelBreakdown,
  campaignRows,
  sourceRows,
  recentOrders,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const menuConversion =
    summary.menu_sessions > 0
      ? Math.round((summary.menu_submitted / summary.menu_sessions) * 100)
      : 0

  function setPeriod(days: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', String(days))
    router.push(`/marketing/roi?${params.toString()}`)
  }

  return (
    <div className="space-y-12">
      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Visao consolidada · ultimos {periodDays} dias
          </h2>
          <div className="flex gap-1">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                onClick={() => setPeriod(days)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[11px] font-medium tracking-tight transition-colors',
                  periodDays === days
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-foreground/75 hover:text-foreground hover:border-stone'
                )}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-x-8 gap-y-6">
          <Stat
            label="Receita atribuida"
            value={currency.format(summary.revenue_attributed)}
            tone="leaf"
          />
          <Stat label="Pedidos" value={String(summary.orders_attributed)} />
          <Stat label="Custo estimado" value={currency.format(summary.cost_total)} tone="warm" />
          <Stat
            label="ROAS"
            value={summary.roas !== null ? `${summary.roas.toFixed(1)}x` : '—'}
            tone={summary.roas && summary.roas >= 3 ? 'leaf' : 'neutral'}
          />
          <Stat label="Sessoes cardapio" value={String(summary.menu_sessions)} />
          <Stat label="Conversao" value={`${menuConversion}%`} />
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-5">
          Funil
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <FunnelStep label="Disparados" value={summary.recipients_sent} sub="campanhas" />
          <FunnelStep
            label="Entregues"
            value={summary.recipients_delivered}
            sub={`${percentOf(summary.recipients_delivered, summary.recipients_sent)} de disparados`}
          />
          <FunnelStep
            label="Cliques"
            value={summary.link_clicks}
            sub={`${percentOf(summary.link_clicks, summary.recipients_delivered)} CTR`}
          />
          <FunnelStep
            label="Visitas cardapio"
            value={summary.menu_sessions}
            sub={`${summary.menu_with_cart} com carrinho`}
          />
          <FunnelStep
            label="Pedidos"
            value={summary.menu_submitted + summary.orders_attributed}
            sub={currency.format(summary.revenue_attributed)}
            tone="leaf"
          />
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Receita por origem
          </h2>
          <span className="text-[10px] font-data text-muted tracking-tight">
            {currency.format(summary.revenue_attributed)} total
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RevenueCard
            label="Agente IA"
            value={currency.format(summary.revenue_ai_agent)}
            sub={`${summary.ai_drafts_confirmed} pedidos confirmados`}
            tone="leaf"
          />
          <RevenueCard
            label="Campanhas"
            value={currency.format(summary.revenue_campaign)}
            sub="atribuido por janela 7d"
          />
          <RevenueCard
            label="Cardapio publico"
            value={currency.format(summary.revenue_menu_session)}
            sub="QR / link / direto"
          />
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-5">
          Custo estimado por canal
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <CostCard label="Z-API (assinatura)" value={summary.cost_breakdown.zapi_subscription} />
          <CostCard label="WhatsApp (msgs)" value={summary.cost_breakdown.whatsapp} />
          <CostCard label="Email (Resend)" value={summary.cost_breakdown.email} />
          <CostCard label="SMS (Twilio)" value={summary.cost_breakdown.sms} />
          <CostCard label="IA — Chat" value={summary.cost_breakdown.ai_chat} />
          <CostCard label="IA — Pedidos" value={summary.cost_breakdown.ai_order} />
        </div>
        <p className="text-[11px] text-muted tracking-tight mt-4">
          Estimativa baseada em volumes do periodo. Ajuste a tabela em{' '}
          <code>roi-cost.ts</code> conforme contratos reais.
        </p>
      </section>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-5">
          Performance por canal
        </h2>
        <div>
          <div className="grid grid-cols-[1fr_80px_80px_80px_80px_120px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
            <span>Canal</span>
            <span className="text-right">Campanhas</span>
            <span className="text-right">Enviadas</span>
            <span className="text-right">Entregues</span>
            <span className="text-right">Cliques</span>
            <span className="text-right">Custo</span>
          </div>
          {channelBreakdown.map((channel) => (
            <div
              key={channel.channel}
              className="grid grid-cols-[1fr_80px_80px_80px_80px_120px] gap-4 py-3 border-b border-border items-center"
            >
              <span className="text-[13px] text-foreground tracking-tight">
                {CHANNEL_LABELS[channel.channel]}
              </span>
              <span className="text-[12px] font-data text-foreground/75 text-right">
                {channel.campaigns_count}
              </span>
              <span className="text-[12px] font-data text-foreground/75 text-right">
                {channel.recipients_sent}
              </span>
              <span className="text-[12px] font-data text-foreground text-right">
                {channel.recipients_delivered}
              </span>
              <span className="text-[12px] font-data text-foreground text-right">
                {channel.link_clicks}
                {channel.unique_clicks > 0 && (
                  <span className="text-muted ml-1">/{channel.unique_clicks}u</span>
                )}
              </span>
              <span className="text-[12px] font-data text-accent-foreground text-right">
                {currency.format(channel.cost_brl)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {campaignRows.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-5">
            Top campanhas por receita atribuida
          </h2>
          <div>
            <div className="grid grid-cols-[2fr_80px_80px_80px_80px_120px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
              <span>Campanha</span>
              <span>Canal</span>
              <span className="text-right">Entregues</span>
              <span className="text-right">Cliques</span>
              <span className="text-right">Pedidos</span>
              <span className="text-right">Receita</span>
            </div>
            {campaignRows.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/marketing/campaigns/${campaign.id}`}
                className="grid grid-cols-[2fr_80px_80px_80px_80px_120px] gap-4 py-3 border-b border-border items-center hover:bg-muted-subtle/30 transition-colors"
              >
                <span className="text-[13px] text-foreground tracking-tight truncate">
                  {campaign.name}
                </span>
                <span className="text-[11px] text-foreground/75 tracking-tight">
                  {CHANNEL_LABELS[campaign.channel] ?? campaign.channel}
                </span>
                <span className="text-[12px] font-data text-foreground/75 text-right">
                  {campaign.recipients_delivered}
                </span>
                <span className="text-[12px] font-data text-foreground text-right">
                  {campaign.unique_clicks}
                </span>
                <span className="text-[12px] font-data text-foreground text-right">
                  {campaign.orders_attributed}
                </span>
                <span className="text-[12px] font-data text-success text-right">
                  {currency.format(campaign.revenue_attributed)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {sourceRows.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-5">
            Trafego do cardapio publico
          </h2>
          <div>
            <div className="grid grid-cols-[1fr_80px_80px_80px_80px_120px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
              <span>Fonte</span>
              <span className="text-right">Sessoes</span>
              <span className="text-right">Carrinho</span>
              <span className="text-right">Pedidos</span>
              <span className="text-right">Abandono</span>
              <span className="text-right">Receita</span>
            </div>
            {sourceRows.map((row) => (
              <div
                key={row.source}
                className="grid grid-cols-[1fr_80px_80px_80px_80px_120px] gap-4 py-3 border-b border-border items-center"
              >
                <span className="text-[13px] text-foreground tracking-tight">
                  {SOURCE_LABELS[row.source] ?? row.source}
                </span>
                <span className="text-[12px] font-data text-foreground/75 text-right">
                  {row.sessions}
                </span>
                <span className="text-[12px] font-data text-foreground/75 text-right">
                  {row.with_cart}
                </span>
                <span className="text-[12px] font-data text-foreground text-right">
                  {row.submitted}
                </span>
                <span
                  className={cn(
                    'text-[12px] font-data text-right',
                    row.abandoned > 0 ? 'text-accent-foreground' : 'text-muted'
                  )}
                >
                  {row.abandoned}
                </span>
                <span className="text-[12px] font-data text-success text-right">
                  {currency.format(row.revenue_brl)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Agente IA
          </h2>
          <Link
            href="/configuracoes/assistente"
            className="text-[11px] text-foreground/75 hover:text-foreground tracking-tight transition-colors"
          >
            Configurar →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4">
          <Stat label="Drafts totais" value={String(summary.ai_drafts_total)} />
          <Stat label="Confirmados" value={String(summary.ai_drafts_confirmed)} tone="leaf" />
          <Stat label="Cancelados" value={String(summary.ai_drafts_cancelled)} />
          <Stat label="Em construcao" value={String(summary.ai_drafts_building)} />
        </div>
      </section>

      {recentOrders.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-5">
            Pedidos recentes atribuidos
          </h2>
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-[120px_1fr_120px_100px_120px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
              <span>Quando</span>
              <span>Cliente</span>
              <span>Origem</span>
              <span className="text-right">Total</span>
              <span>Source</span>
            </div>
            {recentOrders.map((order) => {
              const meta = ORIGIN_META[order.origin]
              return (
                <div
                  key={order.id}
                  className="grid grid-cols-[120px_1fr_120px_100px_120px] gap-4 py-3 items-center"
                >
                  <span className="text-[10px] font-data text-muted">
                    {new Date(order.created_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="text-[12px] text-foreground tracking-tight truncate">
                    {order.customer_name ?? 'Anonimo'}
                  </span>
                  <span className={cn('text-[11px] tracking-tight', meta?.tone)}>
                    {meta?.label ?? order.origin_label}
                  </span>
                  <span className="text-[12px] font-data text-foreground text-right">
                    {currency.format(order.total)}
                  </span>
                  <span className="text-[10px] font-data text-muted tracking-tight">
                    {order.source}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function percentOf(value: number, base: number) {
  return base <= 0 ? '—' : `${Math.round((value / base) * 100)}%`
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

function FunnelStep({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: number
  sub?: string
  tone?: 'neutral' | 'leaf'
}) {
  return (
    <div className="border border-border rounded-md px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">{label}</p>
      <p
        className={cn(
          'text-[20px] font-medium tracking-[-0.02em] font-data mt-2',
          tone === 'leaf' ? 'text-success' : 'text-foreground'
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] font-data text-muted tracking-tight mt-1">{sub}</p>}
    </div>
  )
}

function RevenueCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'neutral' | 'leaf'
}) {
  return (
    <div
      className={cn(
        'border rounded-lg px-4 py-4',
        tone === 'leaf' ? 'border-success/30 bg-success/5' : 'border-border'
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p
        className={cn(
          'text-[22px] font-medium tracking-[-0.02em] font-data mt-3',
          tone === 'leaf' ? 'text-success' : 'text-foreground'
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted tracking-tight mt-1.5">{sub}</p>}
    </div>
  )
}

function CostCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border rounded-md px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="text-[16px] font-medium tracking-[-0.02em] font-data text-accent-foreground mt-1.5">
        {value > 0 ? currency.format(value) : '—'}
      </p>
    </div>
  )
}
