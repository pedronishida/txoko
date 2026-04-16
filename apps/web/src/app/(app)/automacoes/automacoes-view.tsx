'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Plus, Trash2, Pencil, Play, ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  toggleAutomation,
  deleteAutomation,
  testAutomation,
  listAutomationRuns,
} from './actions'
import { PageHeader } from '@/components/page-header'
import { MetricBand } from '@/components/metric-band'
import { TabBar } from '@/components/tab-bar'
import { AutomationBuilder, type AutomationEditData } from './automation-builder'

export type AutomationRow = {
  id: string
  code: string
  name: string | null
  description: string | null
  trigger: string
  action: string
  area: string
  enabled: boolean
  executions_today: number
  run_count: number | null
  last_run_at: string | null
  trigger_type: string | null
  trigger_config: Record<string, unknown> | null
  action_type: string | null
  action_config: Record<string, unknown> | null
}

export type AutomationLogRow = {
  id: string
  automation_id: string | null
  trigger_desc: string
  action_desc: string
  status: 'success' | 'error'
  error_message: string | null
  executed_at: string
}

export type AutomationRunRow = {
  id: string
  automation_id: string | null
  triggered_at: string
  status: 'success' | 'failed'
  target_entity_id: string | null
  result: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AREA_LABEL: Record<string, string> = {
  operacao: 'Operacao',
  marketing: 'Marketing',
  financeiro: 'Financeiro',
  estoque: 'Estoque',
  crm: 'CRM',
  fiscal: 'Fiscal',
  rh: 'RH',
  custom: 'Personalizada',
}

const TRIGGER_LABEL: Record<string, string> = {
  new_customer: 'Novo cliente',
  no_visit_30d: 'Cliente inativo',
  birthday: 'Aniversario do cliente',
  low_stock: 'Estoque baixo',
  new_order: 'Novo pedido',
  order_completed: 'Pedido concluido',
  review_negative: 'Avaliacao negativa',
}

const ACTION_LABEL: Record<string, string> = {
  send_whatsapp: 'Enviar WhatsApp',
  send_email: 'Enviar E-mail',
  create_task: 'Criar tarefa',
  notify_staff: 'Notificar equipe',
  apply_discount: 'Criar cupom',
}

const LIVE_CODES = new Set(['stock_low', 'sale_finalized', 'negative_review'])

type AreaFilter = 'all' | string

type Props = {
  automations: AutomationRow[]
  logs: AutomationLogRow[]
  restaurantId: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutomacoesView({
  automations: initial,
  logs: initialLogs,
  restaurantId,
}: Props) {
  const [automations, setAutomations] = useState(initial)
  const [logs, setLogs] = useState(initialLogs)
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Builder modal
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingAutomation, setEditingAutomation] = useState<AutomationEditData | null>(null)

  // Detail / runs panel
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [runs, setRuns] = useState<Record<string, AutomationRunRow[]>>({})
  const [loadingRuns, setLoadingRuns] = useState(false)

  // ---------------------------------------------------------------------------
  // Realtime subscriptions
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const supabase = createClient()

    const autosChannel = supabase
      .channel(`automacoes-autos-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'automations',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAutomations((prev) => [...prev, payload.new as AutomationRow])
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as AutomationRow
            setAutomations((prev) =>
              prev.map((a) => (a.id === row.id ? { ...a, ...row } : a))
            )
          } else if (payload.eventType === 'DELETE') {
            setAutomations((prev) => prev.filter((a) => a.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    const logsChannel = supabase
      .channel(`automacoes-logs-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'automation_logs',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const row = payload.new as AutomationLogRow
          setLogs((prev) =>
            prev.some((l) => l.id === row.id) ? prev : [row, ...prev].slice(0, 50)
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(autosChannel)
      supabase.removeChannel(logsChannel)
    }
  }, [restaurantId])

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    if (areaFilter === 'all') return automations
    return automations.filter((a) => a.area === areaFilter)
  }, [automations, areaFilter])

  const activeCount = automations.filter((a) => a.enabled).length
  const totalExec = automations.reduce((s, a) => s + (a.run_count ?? a.executions_today), 0)
  const customCount = automations.filter((a) => a.area === 'custom').length
  const areas = [...new Set(automations.map((a) => a.area))]

  const successLogs = logs.filter((l) => l.status === 'success').length
  const totalLogs = logs.length
  const successRate = totalLogs > 0 ? (successLogs / totalLogs) * 100 : 100

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function handleToggle(id: string, current: boolean) {
    const prev = automations
    setAutomations((a) =>
      a.map((x) => (x.id === id ? { ...x, enabled: !current } : x))
    )
    setError(null)
    startTransition(async () => {
      const res = await toggleAutomation(id, !current)
      if ('error' in res && res.error) {
        setError(res.error)
        setAutomations(prev)
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Remover esta automacao? Esta acao nao pode ser desfeita.')) return
    const prev = automations
    setAutomations((a) => a.filter((x) => x.id !== id))
    startTransition(async () => {
      const res = await deleteAutomation(id)
      if ('error' in res && res.error) {
        setError(res.error)
        setAutomations(prev)
      }
    })
  }

  function handleTest(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await testAutomation(id)
      if ('error' in res && res.error) {
        setError(res.error)
      }
    })
  }

  function handleEdit(auto: AutomationRow) {
    setEditingAutomation({
      id: auto.id,
      name: auto.name ?? auto.code,
      description: auto.description,
      trigger_type: auto.trigger_type as AutomationEditData['trigger_type'],
      trigger_config: auto.trigger_config ?? {},
      action_type: auto.action_type as AutomationEditData['action_type'],
      action_config: auto.action_config ?? {},
      enabled: auto.enabled,
    })
    setShowBuilder(true)
  }

  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (runs[id]) return // already loaded

    setLoadingRuns(true)
    const res = await listAutomationRuns(id)
    setLoadingRuns(false)
    if ('runs' in res && res.runs) {
      setRuns((prev) => ({ ...prev, [id]: res.runs as AutomationRunRow[] }))
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function formatTime(ts: string) {
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min atras`
    if (mins < 1440) return `${Math.floor(mins / 60)}h atras`
    return `${Math.floor(mins / 1440)}d atras`
  }

  function getDisplayLabel(auto: AutomationRow): { trigger: string; action: string } {
    return {
      trigger: auto.trigger_type
        ? (TRIGGER_LABEL[auto.trigger_type] ?? auto.trigger)
        : auto.trigger,
      action: auto.action_type
        ? (ACTION_LABEL[auto.action_type] ?? auto.action)
        : auto.action,
    }
  }

  const areaTabs = [
    { key: 'all', label: 'Todas', count: automations.length },
    ...areas.map((area) => ({
      key: area,
      label: AREA_LABEL[area] || area,
      count: automations.filter((a) => a.area === area).length,
    })),
  ]

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="-mx-8 -mt-6">
      {/* Header */}
      <div className="px-8 pt-6 pb-5">
        <PageHeader
          title="Automacoes"
          subtitle={`Gatilhos automaticos — ${customCount} personalizadas criadas`}
          action={
            <button
              onClick={() => {
                setEditingAutomation(null)
                setShowBuilder(true)
              }}
              className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
            >
              <Plus size={14} strokeWidth={2.5} />
              Nova automacao
            </button>
          }
        />
      </div>

      {/* KPI band */}
      <div className="px-8">
        <MetricBand
          metrics={[
            { label: 'Ativas', value: `${activeCount} / ${automations.length}`, tone: 'neutral' },
            { label: 'Execucoes totais', value: String(totalExec), tone: 'neutral' },
            {
              label: 'Taxa de sucesso',
              value: `${successRate.toFixed(1)}%`,
              tone: successRate >= 90 ? 'positive' : 'neutral',
            },
          ]}
          columns={3}
        />
      </div>

      <div className="px-8 py-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-x-12 gap-y-10">
        <section>
          {error && (
            <div className="mb-5 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)}>
                <X size={12} />
              </button>
            </div>
          )}

          <div className="mb-6">
            <TabBar
              tabs={areaTabs}
              active={areaFilter}
              onChange={setAreaFilter}
            />
          </div>

          <div className="divide-y divide-night-lighter">
            {filtered.map((auto) => {
              const isLive = LIVE_CODES.has(auto.code)
              const isCustom = auto.area === 'custom'
              const isExpanded = expandedId === auto.id
              const { trigger, action } = getDisplayLabel(auto)

              return (
                <div key={auto.id}>
                  <article
                    className={cn(
                      'py-5 flex items-start justify-between gap-4 transition-opacity',
                      !auto.enabled && 'opacity-50'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                          {AREA_LABEL[auto.area] || auto.area}
                        </span>
                        {isLive && (
                          <>
                            <span className="text-stone-dark text-[10px]">·</span>
                            <span className="flex items-center gap-1.5 text-[10px] text-leaf tracking-tight">
                              <span className="relative flex">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-leaf opacity-60 animate-ping" />
                                <span className="relative inline-flex rounded-full h-1 w-1 bg-leaf" />
                              </span>
                              ao vivo
                            </span>
                          </>
                        )}
                        {(auto.run_count ?? auto.executions_today) > 0 && (
                          <>
                            <span className="text-stone-dark text-[10px]">·</span>
                            <span className="text-[10px] font-data text-stone-dark">
                              {auto.run_count ?? auto.executions_today}× executado
                            </span>
                          </>
                        )}
                        {auto.last_run_at && (
                          <>
                            <span className="text-stone-dark text-[10px]">·</span>
                            <span className="text-[10px] text-stone-dark">
                              {formatTime(auto.last_run_at)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Name (for custom automations) */}
                      {isCustom && auto.name && (
                        <p className="text-[12px] font-medium text-cloud tracking-tight mb-1">
                          {auto.name}
                        </p>
                      )}

                      <p className="text-[13px] text-cloud tracking-tight leading-snug">
                        <span className="text-stone-dark">Quando </span>
                        {trigger}
                      </p>
                      <p className="text-[13px] text-stone-light tracking-tight leading-snug mt-0.5">
                        <span className="text-stone-dark">Entao </span>
                        {action}
                      </p>

                      {auto.description && (
                        <p className="text-[11px] text-stone tracking-tight mt-1.5 leading-snug">
                          {auto.description}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCustom && (
                        <>
                          <button
                            onClick={() => handleTest(auto.id)}
                            disabled={pending}
                            title="Testar automacao"
                            className="w-8 h-8 flex items-center justify-center rounded-md text-stone hover:text-leaf hover:bg-leaf/10 transition-colors disabled:opacity-40"
                          >
                            <Play size={12} />
                          </button>
                          <button
                            onClick={() => handleEdit(auto)}
                            title="Editar automacao"
                            className="w-8 h-8 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(auto.id)}
                            title="Remover automacao"
                            className="w-8 h-8 flex items-center justify-center rounded-md text-stone hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleToggle(auto.id, auto.enabled)}
                        disabled={pending}
                        className={cn(
                          'h-8 px-3 text-[11px] font-medium rounded-md transition-colors disabled:opacity-40 tracking-tight',
                          auto.enabled
                            ? 'text-stone-light hover:text-cloud hover:bg-night-light'
                            : 'bg-cloud text-night hover:bg-cloud-dark'
                        )}
                      >
                        {auto.enabled ? 'Desativar' : 'Ativar'}
                      </button>

                      {/* Expand runs for custom automations */}
                      {isCustom && (
                        <button
                          onClick={() => handleExpand(auto.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
                          title="Ver historico de execucoes"
                        >
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      )}
                    </div>
                  </article>

                  {/* Runs panel */}
                  {isExpanded && (
                    <div className="pb-4 -mt-1">
                      <div className="bg-night rounded-lg border border-night-lighter p-4">
                        <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
                          Historico de execucoes
                        </p>
                        {loadingRuns ? (
                          <p className="text-[12px] text-stone tracking-tight">
                            Carregando...
                          </p>
                        ) : !runs[auto.id] || runs[auto.id].length === 0 ? (
                          <p className="text-[12px] text-stone tracking-tight">
                            Nenhuma execucao registrada. Use o botao
                            &ldquo;Testar&rdquo; para executar manualmente.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {runs[auto.id].slice(0, 10).map((run) => (
                              <div key={run.id} className="relative pl-4">
                                <span
                                  className={cn(
                                    'absolute left-0 top-1.5 w-1 h-1 rounded-full',
                                    run.status === 'success' ? 'bg-leaf' : 'bg-primary'
                                  )}
                                />
                                <p className="text-[11px] font-data text-stone-dark tracking-tight">
                                  {formatTime(run.triggered_at)} —
                                  <span
                                    className={cn(
                                      'ml-1',
                                      run.status === 'success' ? 'text-leaf' : 'text-primary'
                                    )}
                                  >
                                    {run.status === 'success' ? 'sucesso' : 'falhou'}
                                  </span>
                                  {run.target_entity_id && run.target_entity_id !== 'test' && (
                                    <span className="ml-1 text-stone">
                                      (id: {run.target_entity_id.slice(0, 8)})
                                    </span>
                                  )}
                                  {run.target_entity_id === 'test' && (
                                    <span className="ml-1 text-warm text-[10px]">teste</span>
                                  )}
                                </p>
                                {Boolean((run.result as Record<string, unknown> | null)?.message) && (
                                  <p className="text-[11px] text-stone tracking-tight mt-0.5">
                                    {String((run.result as Record<string, unknown>).message)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-[14px] text-stone tracking-tight">
                Nenhuma automacao encontrada
              </p>
              {areaFilter !== 'all' && (
                <p className="text-[12px] text-stone-dark mt-1.5 tracking-tight">
                  Tente filtrar por &ldquo;Todas&rdquo; ou crie uma nova automacao
                </p>
              )}
            </div>
          )}
        </section>

        {/* Right panel: execution log */}
        <aside>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-5">
            Execucoes recentes
          </h2>
          {logs.length === 0 ? (
            <p className="text-[12px] text-stone tracking-tight leading-relaxed">
              Nenhuma execucao registrada. Triggers ao vivo geram logs
              automaticamente ao fechar pedidos, mover estoque e criar
              avaliacoes negativas.
            </p>
          ) : (
            <div className="space-y-5">
              {logs.map((log) => (
                <div key={log.id} className="relative pl-4">
                  <span
                    className={cn(
                      'absolute left-0 top-1.5 w-1 h-1 rounded-full',
                      log.status === 'success' ? 'bg-leaf' : 'bg-primary'
                    )}
                  />
                  <p className="text-[11px] font-data text-stone-dark tracking-tight mb-0.5">
                    {formatTime(log.executed_at)}
                  </p>
                  <p className="text-[12px] text-cloud tracking-tight leading-snug">
                    {log.trigger_desc}
                  </p>
                  <p className="text-[11px] text-stone tracking-tight mt-0.5 leading-snug">
                    {log.action_desc}
                  </p>
                  {log.error_message && (
                    <p className="text-[11px] text-primary tracking-tight mt-0.5">
                      {log.error_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Builder modal */}
      {showBuilder && (
        <AutomationBuilder
          editing={editingAutomation}
          onClose={() => {
            setShowBuilder(false)
            setEditingAutomation(null)
          }}
          onSaved={() => {
            // Realtime subscription handles list refresh
          }}
        />
      )}
    </div>
  )
}
