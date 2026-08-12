'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ReportCard } from '@/components/reports/report-card'
import { SimpleBarChart } from '@/components/reports/simple-bar-chart'
import { SimplePieChart } from '@/components/reports/simple-pie-chart'
import type {
  AdminAgentAnalytics,
  AgentHealthCheck,
  CustomerAgentAnalytics,
  AdminAgentSuggestion,
} from '../actions'

const STATUS_LABEL: Record<string, string> = {
  success: 'Sucesso',
  failed: 'Erro',
  rejected_by_user: 'Recusada pelo admin',
  denied_by_rbac: 'Sem permissao (RBAC)',
  confirmation_pending: 'Aguardando confirmacao',
}

const STATUS_COLOR: Record<string, string> = {
  success: '#4ADE80',
  failed: '#EF4444',
  rejected_by_user: '#F59E0B',
  denied_by_rbac: '#A78BFA',
  confirmation_pending: '#60A5FA',
}

const PERIODS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
]

const DISMISSED_KEY = 'txoko_suggestions_dismissed_v1'

// Le os dismisses persistidos, descartando os expirados (24h)
function loadDismissed(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, number>
    const now = Date.now()
    const valid: Record<string, number> = {}
    for (const [id, expiry] of Object.entries(parsed)) {
      if (expiry > now) valid[id] = expiry
    }
    return valid
  } catch {
    return {}
  }
}

function formatBrl(v: number) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

function formatMinutes(m: number) {
  if (m < 60) return `${Math.round(m)}min`
  const hours = Math.floor(m / 60)
  const rest = Math.round(m % 60)
  return rest > 0 ? `${hours}h ${rest}min` : `${hours}h`
}

type Props = {
  analytics: AdminAgentAnalytics
  health: AgentHealthCheck[]
  customer: CustomerAgentAnalytics
  suggestions: AdminAgentSuggestion[]
  days: number
}

export function AnalyticsView({ analytics, health, customer, suggestions, days }: Props) {
  const router = useRouter()
  const [agentTab, setAgentTab] = useState<'admin' | 'customer'>('admin')
  const [dismissed, setDismissed] = useState<Record<string, number>>({})

  useEffect(() => {
    setDismissed(loadDismissed())
  }, [])

  const visibleSuggestions = suggestions.filter((s) => !dismissed[s.id])

  const successRate =
    analytics.total_actions > 0
      ? ((analytics.success_actions / analytics.total_actions) * 100).toFixed(1)
      : '—'

  const adminDaily = analytics.daily.map((d) => ({
    label: d.label,
    value: d.success,
    secondaryValue: d.failed,
  }))

  const statusPie = analytics.by_status.map((s) => ({
    label: STATUS_LABEL[s.status] ?? s.status,
    value: s.count,
    color: STATUS_COLOR[s.status] ?? '#78716C',
  }))

  function setDays(value: number) {
    const url = new URL(window.location.href)
    url.searchParams.set('days', String(value))
    router.push(url.pathname + url.search)
  }

  function dismiss(id: string) {
    const next = { ...dismissed, [id]: Date.now() + 86400000 }
    setDismissed(next)
    try {
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
    } catch {
      // localStorage indisponivel — segue sem persistir
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/configuracoes/agente-admin"
            className="text-[11px] text-muted hover:text-foreground uppercase tracking-[0.08em]"
          >
            ← Agente Admin
          </Link>
          <h1 className="text-2xl font-medium tracking-tight text-foreground mt-2">
            Analytics da IA
          </h1>
          <p className="text-muted text-sm mt-1">
            Acoes processadas, custo, tempo economizado e saude do sistema.
          </p>
        </div>
        <div className="flex gap-1 bg-surface-hover border border-border rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.05em] rounded-md transition-colors ${
                days === p.value ? 'bg-success/20 text-success' : 'text-muted hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {visibleSuggestions.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted uppercase tracking-[0.08em] mb-3">
            Sugestoes ({visibleSuggestions.length})
          </h2>
          <div className="space-y-2">
            {visibleSuggestions.map((s) => (
              <SuggestionCard key={s.id} s={s} onDismiss={() => dismiss(s.id)} />
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-1 bg-surface-hover border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setAgentTab('admin')}
          className={`px-4 py-2 text-xs font-medium uppercase tracking-[0.05em] rounded-md transition-colors ${
            agentTab === 'admin' ? 'bg-success/20 text-success' : 'text-muted hover:text-foreground'
          }`}
        >
          Agente Admin · {analytics.total_actions}
        </button>
        <button
          onClick={() => setAgentTab('customer')}
          className={`px-4 py-2 text-xs font-medium uppercase tracking-[0.05em] rounded-md transition-colors ${
            agentTab === 'customer'
              ? 'bg-success/20 text-success'
              : 'text-muted hover:text-foreground'
          }`}
        >
          Agente Cliente · {customer.total_events}
        </button>
      </div>

      {agentTab === 'customer' ? <CustomerAgentPanel c={customer} days={days} /> : null}

      {agentTab !== 'admin' ? null : (
        <>
          <section>
            <h2 className="text-sm font-medium text-muted uppercase tracking-[0.08em] mb-3">
              Saude do sistema
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {health.map((check) => (
                <div
                  key={check.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    check.ok
                      ? 'bg-success/5 border-success/20'
                      : 'bg-accent/5 border-accent/30'
                  }`}
                >
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
                      check.ok
                        ? 'bg-success text-success-foreground'
                        : 'bg-accent text-accent-foreground'
                    }`}
                  >
                    {check.ok ? '✓' : '!'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-foreground font-medium">{check.label}</p>
                    <p className="text-xs text-muted mt-0.5">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ReportCard
              label={`Acoes ${days}d`}
              value={analytics.total_actions.toLocaleString('pt-BR')}
              sub={`${successRate}% sucesso`}
              tone={analytics.total_actions > 0 ? 'positive' : 'neutral'}
            />
            <ReportCard
              label="Tempo economizado"
              value={formatMinutes(analytics.total_minutes_saved)}
              sub="estimativa por categoria de tool"
              tone="positive"
            />
            <ReportCard
              label="Custo IA"
              value={formatBrl(analytics.total_cost_brl)}
              sub={`Anthropic + Vision · ${days}d`}
              tone="neutral"
            />
            <ReportCard
              label="Briefings entregues"
              value={`${analytics.briefings_delivered}`}
              sub={
                analytics.briefings_failed > 0
                  ? `${analytics.briefings_failed} falharam`
                  : 'sem falhas'
              }
              tone={analytics.briefings_failed > 0 ? 'warn' : 'positive'}
            />
          </section>

          <section className="bg-surface-hover border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-foreground">Atividade diaria</h2>
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-success" />
                  Sucesso
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-destructive" />
                  Erro
                </span>
              </div>
            </div>
            {analytics.daily.some((d) => d.total > 0) ? (
              <SimpleBarChart
                data={adminDaily}
                height={180}
                primaryColor="#4ADE80"
                secondaryColor="#EF4444"
                showSecondary
              />
            ) : (
              <div className="text-center text-muted text-sm py-12">
                Sem atividade nos ultimos {days} dias.
                <br />
                <span className="text-xs">
                  Cadastre admins e ative o agente pra ver dados aqui.
                </span>
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface-hover border border-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-foreground mb-3">Tools mais usadas</h2>
              {analytics.by_tool.length === 0 ? (
                <p className="text-muted text-sm text-center py-8">
                  Nenhuma tool executada ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {analytics.by_tool.slice(0, 10).map((tool) => {
                    const max = analytics.by_tool[0].count
                    const pct = (tool.count / max) * 100
                    return (
                      <div key={tool.tool_name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-mono text-foreground">{tool.tool_name}</span>
                          <span className="text-muted">
                            {tool.count}× ·{' '}
                            <span className="text-success">
                              {formatMinutes(tool.minutes_saved)}
                            </span>
                            {tool.failed > 0 && (
                              <span className="text-destructive"> · {tool.failed} erros</span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted-subtle rounded-full overflow-hidden">
                          <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="bg-surface-hover border border-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-foreground mb-3">Status das acoes</h2>
              {statusPie.length === 0 ? (
                <p className="text-muted text-sm text-center py-8">Sem dados.</p>
              ) : (
                <div className="flex items-center gap-6">
                  <SimplePieChart data={statusPie} size={140} />
                  <div className="space-y-2 flex-1">
                    {analytics.by_status.map((s) => (
                      <div key={s.status} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-foreground">
                          <span
                            className="w-2.5 h-2.5 rounded-sm"
                            style={{ backgroundColor: STATUS_COLOR[s.status] ?? '#78716C' }}
                          />
                          {STATUS_LABEL[s.status] ?? s.status}
                        </span>
                        <span className="text-muted font-mono">
                          {s.count} ({s.pct.toFixed(0)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface-hover border border-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-foreground mb-3">Admins mais ativos</h2>
              {analytics.top_admins.length === 0 ? (
                <p className="text-muted text-sm text-center py-8">Nenhum admin usou ainda.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-[0.08em] text-muted">
                    <tr>
                      <th className="text-left pb-2">Admin</th>
                      <th className="text-right pb-2">Acoes</th>
                      <th className="text-right pb-2">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.top_admins.map((admin) => (
                      <tr key={admin.phone} className="border-t border-border">
                        <td className="py-2 text-foreground">
                          {admin.name ?? '—'}
                          <span className="text-muted font-mono ml-1">{admin.phone}</span>
                        </td>
                        <td className="py-2 text-right font-mono text-foreground">
                          {admin.count}
                        </td>
                        <td className="py-2 text-right font-mono text-muted">
                          {formatBrl(admin.cost_brl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-[10px] text-muted mt-3">
                {analytics.active_admins} admin{analytics.active_admins === 1 ? '' : 's'} ativo
                {analytics.active_admins === 1 ? '' : 's'} no total.
              </p>
            </div>
            <div className="bg-surface-hover border border-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-foreground mb-3">Briefings recentes</h2>
              {analytics.briefings.length === 0 ? (
                <p className="text-muted text-sm text-center py-8">
                  Nenhum briefing nos ultimos {days} dias.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                  {analytics.briefings.map((briefing, i) => (
                    <div
                      key={`${briefing.date}-${briefing.phone}-${i}`}
                      className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted-subtle/40"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            briefing.delivered ? 'bg-success' : 'bg-destructive'
                          }`}
                        />
                        <span className="text-foreground">{briefing.date}</span>
                        <span className="text-muted font-mono">{briefing.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {briefing.format && (
                          <span className="text-[10px] uppercase tracking-[0.05em] text-muted bg-muted-subtle px-1.5 py-0.5 rounded">
                            {briefing.format}
                          </span>
                        )}
                        <span
                          className={`text-[10px] uppercase tracking-[0.05em] ${
                            briefing.delivered ? 'text-success' : 'text-destructive'
                          }`}
                        >
                          {briefing.delivered ? 'entregue' : 'falhou'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <footer className="border-t border-border pt-4 text-[11px] text-muted">
            <p>
              <strong className="text-muted">Custo</strong>: soma do <code>cost_brl</code>{' '}
              registrado em <code>admin_agent_actions</code> (Anthropic + Vision API).
            </p>
            <p className="mt-1">
              <strong className="text-muted">Tempo economizado</strong>: estimativa conservadora
              por categoria de tool — 1.5min consultas, 3min escritas, 5–8min processamento de
              imagem (cupom/Pix), 15min lancar campanha. So conta acoes com status=success.
            </p>
          </footer>
        </>
      )}
    </div>
  )
}

function SuggestionCard({ s, onDismiss }: { s: AdminAgentSuggestion; onDismiss: () => void }) {
  const styles: Record<
    AdminAgentSuggestion['severity'],
    { bg: string; border: string; text: string; dot: string; label: string }
  > = {
    critical: {
      bg: 'bg-destructive/5',
      border: 'border-destructive/30',
      text: 'text-destructive',
      dot: 'bg-destructive',
      label: 'CRITICO',
    },
    warning: {
      bg: 'bg-accent/5',
      border: 'border-accent/30',
      text: 'text-accent-foreground',
      dot: 'bg-accent',
      label: 'ATENCAO',
    },
    info: {
      bg: 'bg-success/5',
      border: 'border-success/20',
      text: 'text-success',
      dot: 'bg-success',
      label: 'DICA',
    },
  }
  const st = styles[s.severity] ?? styles.info

  return (
    <div className={`${st.bg} ${st.border} border rounded-lg p-3 flex items-start gap-3`}>
      <div className={`mt-1 w-1.5 h-1.5 rounded-full ${st.dot} shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-medium uppercase tracking-[0.08em] ${st.text}`}>
            {st.label}
          </span>
          {s.metric && <span className="text-[10px] text-muted font-mono">· {s.metric}</span>}
        </div>
        <p className="text-sm text-foreground font-medium">{s.title}</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">{s.description}</p>
        {s.action_label && s.action_url && (
          <Link
            href={s.action_url}
            className={`inline-block mt-2 text-[11px] uppercase tracking-[0.05em] ${st.text} hover:underline font-medium`}
          >
            {s.action_label} →
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-muted hover:text-foreground text-xs shrink-0"
        title="Dispensar por 24h"
      >
        ✕
      </button>
    </div>
  )
}

function CustomerAgentPanel({ c, days }: { c: CustomerAgentAnalytics; days: number }) {
  const handled = c.replies + c.escalations
  const autoRate = c.auto_resolution_rate.toFixed(0)
  const customerDaily = c.daily.map((d) => ({
    label: d.label,
    value: d.replies,
    secondaryValue: d.escalations,
  }))
  const modePie = [
    { label: 'Q&A (chat)', value: c.by_mode.chat, color: '#60A5FA' },
    { label: 'Order taking', value: c.by_mode.order_taking, color: '#A78BFA' },
  ].filter((m) => m.value > 0)

  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ReportCard
          label={`Respostas ${days}d`}
          value={c.replies.toLocaleString('pt-BR')}
          sub={`${autoRate}% auto-resolvido`}
          tone={c.replies > 0 ? 'positive' : 'neutral'}
        />
        <ReportCard
          label="Escalations"
          value={c.escalations.toLocaleString('pt-BR')}
          sub={
            c.escalations > 0
              ? `${((c.escalations / Math.max(handled, 1)) * 100).toFixed(0)}% das interacoes`
              : 'sem escalations'
          }
          tone={c.escalations > c.replies ? 'warn' : 'neutral'}
        />
        <ReportCard
          label="Pedidos confirmados"
          value={c.orders_confirmed.toLocaleString('pt-BR')}
          sub="via order-agent"
          tone={c.orders_confirmed > 0 ? 'positive' : 'neutral'}
        />
        <ReportCard
          label="Falhas de envio"
          value={c.send_failed.toLocaleString('pt-BR')}
          sub={c.send_failed > 0 ? 'erros Z-API' : 'tudo ok'}
          tone={c.send_failed > 0 ? 'negative' : 'positive'}
        />
      </section>

      <section className="bg-surface-hover border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">
            Atividade diaria · agente cliente
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-success" />
              Respostas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-accent" />
              Escalations
            </span>
          </div>
        </div>
        {c.daily.some((d) => d.replies + d.escalations > 0) ? (
          <SimpleBarChart
            data={customerDaily}
            height={180}
            primaryColor="#4ADE80"
            secondaryColor="#F59E0B"
            showSecondary
          />
        ) : (
          <div className="text-center text-muted text-sm py-12">
            Sem atividade do agente cliente nos ultimos {days} dias.
            <br />
            <span className="text-xs">
              Configure <code>ai_agent_enabled=true</code> no restaurante e espere clientes
              mandarem mensagem.
            </span>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-hover border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-foreground mb-3">Modo de operacao</h2>
          {modePie.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">Sem dados.</p>
          ) : (
            <div className="flex items-center gap-6">
              <SimplePieChart data={modePie} size={140} />
              <div className="space-y-2 flex-1">
                {modePie.map((mode) => {
                  const total = c.by_mode.chat + c.by_mode.order_taking
                  const pct = total > 0 ? ((mode.value / total) * 100).toFixed(0) : '0'
                  return (
                    <div key={mode.label} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-foreground">
                        <span
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: mode.color }}
                        />
                        {mode.label}
                      </span>
                      <span className="text-muted font-mono">
                        {mode.value} ({pct}%)
                      </span>
                    </div>
                  )
                })}
                <div className="pt-2 mt-2 border-t border-border text-[11px] text-muted">
                  {c.total_tool_calls} tool calls totais (so order taking)
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="bg-surface-hover border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-foreground mb-3">
            Top motivos de escalation
          </h2>
          {c.top_escalation_reasons.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">Nenhuma escalation no periodo.</p>
          ) : (
            <div className="space-y-2">
              {c.top_escalation_reasons.map((r) => {
                const max = c.top_escalation_reasons[0].count
                const pct = (r.count / max) * 100
                return (
                  <div key={r.reason}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground truncate flex-1 mr-2">{r.reason}</span>
                      <span className="text-muted font-mono shrink-0">{r.count}×</span>
                    </div>
                    <div className="h-1 bg-muted-subtle rounded-full overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-[10px] text-muted mt-3">
            Use estes motivos pra adicionar entradas na{' '}
            <Link href="/configuracoes/conhecimento" className="text-success hover:underline">
              base de conhecimento
            </Link>
            .
          </p>
        </div>
      </section>

      {(c.skipped > 0 || c.send_failed > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-surface-hover border border-border rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted mb-1">Skipped</p>
            <p className="text-foreground text-lg font-mono">{c.skipped}</p>
            <p className="text-[10px] text-muted">
              Bot decidiu nao responder (mensagem nao-textual, sem KB, etc).
            </p>
          </div>
          <div className="bg-surface-hover border border-border rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted mb-1">
              Send failed (Z-API)
            </p>
            <p className="text-destructive text-lg font-mono">{c.send_failed}</p>
            <p className="text-[10px] text-muted">
              Resposta gerada mas Z-API recusou — verifique status do canal.
            </p>
          </div>
        </section>
      )}

      <footer className="border-t border-border pt-4 text-[11px] text-muted">
        <p>
          <strong className="text-muted">Auto-resolution</strong>: respostas / (respostas +
          escalations). Quanto maior, menos trabalho humano.
        </p>
        <p className="mt-1">
          <strong className="text-muted">Pedidos confirmados</strong>: contagem de chamadas{' '}
          <code>confirmar_pedido</code> com sucesso (so modo order taking — Sonnet 4.5 com
          tools).
        </p>
        <p className="mt-1">
          <strong className="text-muted">Tip</strong>: motivos frequentes de escalation costumam
          virar entradas na base de conhecimento. Cada motivo recorrente = 1 FAQ que o agente
          pode passar a responder sozinho.
        </p>
      </footer>
    </>
  )
}
