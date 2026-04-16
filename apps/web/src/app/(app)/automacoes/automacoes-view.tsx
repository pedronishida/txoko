'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toggleAutomation } from './actions'

export type AutomationRow = {
  id: string
  code: string
  trigger: string
  action: string
  area: string
  enabled: boolean
  executions_today: number
  last_run_at: string | null
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

const AREA_LABEL: Record<string, string> = {
  operacao: 'Operacao',
  marketing: 'Marketing',
  financeiro: 'Financeiro',
  estoque: 'Estoque',
  crm: 'CRM',
  fiscal: 'Fiscal',
  rh: 'RH',
}

const LIVE_CODES = new Set(['stock_low', 'sale_finalized', 'negative_review'])

type AreaFilter = 'all' | string

type Props = {
  automations: AutomationRow[]
  logs: AutomationLogRow[]
  restaurantId: string
}

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
          if (payload.eventType === 'UPDATE') {
            const row = payload.new as AutomationRow
            setAutomations((prev) =>
              prev.map((a) => (a.id === row.id ? row : a))
            )
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

  const filtered = useMemo(() => {
    if (areaFilter === 'all') return automations
    return automations.filter((a) => a.area === areaFilter)
  }, [automations, areaFilter])

  const activeCount = automations.filter((a) => a.enabled).length
  const totalExec = automations.reduce((s, a) => s + a.executions_today, 0)
  const liveCount = automations.filter((a) => LIVE_CODES.has(a.code) && a.enabled).length
  const areas = [...new Set(automations.map((a) => a.area))]

  const successLogs = logs.filter((l) => l.status === 'success').length
  const totalLogs = logs.length
  const successRate = totalLogs > 0 ? (successLogs / totalLogs) * 100 : 100

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

  function formatTime(ts: string) {
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min atras`
    if (mins < 1440) return `${Math.floor(mins / 60)}h atras`
    return `${Math.floor(mins / 1440)}d atras`
  }

  return (
    <div className="-mx-8 -mt-6">
      {/* Header */}
      <header className="px-8 pt-6 pb-6 border-b border-night-lighter">
        <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
          Automacoes
        </h1>
        <p className="text-[13px] text-stone mt-2 tracking-tight">
          Gatilhos automaticos — {liveCount} ligadas a eventos reais
        </p>
      </header>

      {/* KPI band */}
      <section className="px-8 py-8 border-b border-night-lighter grid grid-cols-3 gap-x-10">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Ativas
          </p>
          <div className="flex items-baseline gap-2 mt-3">
            <p className="text-[28px] font-medium text-cloud tracking-[-0.03em] leading-none font-data">
              {activeCount}
            </p>
            <span className="text-[13px] text-stone-dark font-data">
              de {automations.length}
            </span>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Execucoes hoje
          </p>
          <p className="text-[28px] font-medium text-cloud tracking-[-0.03em] leading-none font-data mt-3">
            {totalExec}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Taxa de sucesso
          </p>
          <p className="text-[28px] font-medium text-cloud tracking-[-0.03em] leading-none font-data mt-3">
            {successRate.toFixed(1)}%
          </p>
        </div>
      </section>

      <div className="px-8 py-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-x-12 gap-y-10">
        <section>
          {error && (
            <div className="mb-5 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
              {error}
            </div>
          )}

          <div className="flex items-center gap-5 mb-6 pb-4 border-b border-night-lighter overflow-x-auto no-scrollbar">
            <button
              onClick={() => setAreaFilter('all')}
              className={cn(
                'relative text-[12px] font-medium tracking-tight transition-colors pb-4 -mb-4 whitespace-nowrap shrink-0',
                areaFilter === 'all'
                  ? 'text-cloud'
                  : 'text-stone hover:text-stone-light'
              )}
            >
              Todas
              <span className="ml-1.5 text-[10px] font-data text-stone-dark">
                {automations.length}
              </span>
              {areaFilter === 'all' && (
                <span className="absolute left-0 right-0 -bottom-px h-px bg-cloud" />
              )}
            </button>
            {areas.map((area) => {
              const active = areaFilter === area
              const count = automations.filter((a) => a.area === area).length
              return (
                <button
                  key={area}
                  onClick={() =>
                    setAreaFilter(area === areaFilter ? 'all' : area)
                  }
                  className={cn(
                    'relative text-[12px] font-medium tracking-tight transition-colors pb-4 -mb-4 whitespace-nowrap shrink-0',
                    active ? 'text-cloud' : 'text-stone hover:text-stone-light'
                  )}
                >
                  {AREA_LABEL[area] || area}
                  <span className="ml-1.5 text-[10px] font-data text-stone-dark">
                    {count}
                  </span>
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-px h-px bg-cloud" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="divide-y divide-night-lighter">
            {filtered.map((auto) => {
              const isLive = LIVE_CODES.has(auto.code)
              return (
                <article
                  key={auto.id}
                  className={cn(
                    'py-5 flex items-start justify-between gap-6 transition-opacity',
                    !auto.enabled && 'opacity-50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-2">
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
                      {auto.executions_today > 0 && (
                        <>
                          <span className="text-stone-dark text-[10px]">·</span>
                          <span className="text-[10px] font-data text-stone-dark">
                            {auto.executions_today}× hoje
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-[13px] text-cloud tracking-tight leading-snug">
                      <span className="text-stone-dark">Quando </span>
                      {auto.trigger}
                    </p>
                    <p className="text-[13px] text-stone-light tracking-tight leading-snug mt-0.5">
                      <span className="text-stone-dark">Entao </span>
                      {auto.action}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggle(auto.id, auto.enabled)}
                    disabled={pending}
                    className={cn(
                      'h-8 px-3 text-[11px] font-medium rounded-md transition-colors disabled:opacity-40 tracking-tight shrink-0',
                      auto.enabled
                        ? 'text-stone-light hover:text-cloud hover:bg-night-light'
                        : 'bg-cloud text-night hover:bg-cloud-dark'
                    )}
                  >
                    {auto.enabled ? 'Desativar' : 'Ativar'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

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
    </div>
  )
}
