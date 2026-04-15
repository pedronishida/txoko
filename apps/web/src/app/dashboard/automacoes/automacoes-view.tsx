'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2,
  Clock,
  Play,
  ToggleLeft,
  ToggleRight,
  XCircle,
  Zap,
} from 'lucide-react'
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

const AREA_CONFIG: Record<string, { label: string; color: string }> = {
  operacao: { label: 'Operacao', color: 'bg-primary/10 text-primary' },
  marketing: { label: 'Marketing', color: 'bg-warm/10 text-warm' },
  financeiro: { label: 'Financeiro', color: 'bg-cloud/10 text-cloud' },
  estoque: { label: 'Estoque', color: 'bg-coral/10 text-coral' },
  crm: { label: 'CRM', color: 'bg-stone-light/20 text-stone-light' },
  fiscal: { label: 'Fiscal', color: 'bg-warm/10 text-warm' },
  rh: { label: 'RH', color: 'bg-stone/20 text-stone' },
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-warm/10">
            <Zap size={20} className="text-warm" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cloud">Automacoes</h1>
            <p className="text-sm text-stone">
              Gatilhos automaticos — {liveCount} ligadas a eventos reais do banco
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone">Automacoes Ativas</p>
          <p className="text-2xl font-bold font-data text-leaf">
            {activeCount}{' '}
            <span className="text-sm text-stone font-normal">/ {automations.length}</span>
          </p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone">Execucoes Hoje</p>
          <p className="text-2xl font-bold font-data text-warm">{totalExec}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone">Taxa de Sucesso</p>
          <p className="text-2xl font-bold font-data text-leaf">{successRate.toFixed(1)}%</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setAreaFilter('all')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            areaFilter === 'all'
              ? 'bg-primary/10 text-primary'
              : 'bg-night-light text-stone-light border border-night-lighter'
          )}
        >
          Todas
        </button>
        {areas.map((area) => {
          const cfg = AREA_CONFIG[area]
          return (
            <button
              key={area}
              onClick={() => setAreaFilter(area === areaFilter ? 'all' : area)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                areaFilter === area
                  ? cfg?.color || 'bg-primary/10 text-primary'
                  : 'bg-night-light text-stone-light border border-night-lighter'
              )}
            >
              {cfg?.label || area}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {filtered.map((auto) => {
            const areaCfg = AREA_CONFIG[auto.area]
            const isLive = LIVE_CODES.has(auto.code)
            return (
              <div
                key={auto.id}
                className={cn(
                  'bg-night-light border rounded-xl p-4 transition-colors',
                  auto.enabled ? 'border-night-lighter' : 'border-night-lighter/50 opacity-60'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-medium',
                          areaCfg?.color || 'bg-stone/10 text-stone'
                        )}
                      >
                        {areaCfg?.label || auto.area}
                      </span>
                      {isLive && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-leaf/20 text-leaf flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-leaf animate-pulse" />
                          LIVE
                        </span>
                      )}
                      {auto.executions_today > 0 && (
                        <span className="text-[10px] text-stone font-data flex items-center gap-0.5">
                          <Play size={10} /> {auto.executions_today}x hoje
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-cloud">
                      <span className="text-warm font-medium">Quando:</span> {auto.trigger}
                    </p>
                    <p className="text-sm text-stone-light mt-0.5">
                      <span className="text-leaf font-medium">Entao:</span> {auto.action}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggle(auto.id, auto.enabled)}
                    disabled={pending}
                    className={cn(
                      'p-1 transition-colors disabled:opacity-50',
                      auto.enabled ? 'text-leaf' : 'text-stone'
                    )}
                  >
                    {auto.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-4 py-3 border-b border-night-lighter flex items-center gap-2">
            <Clock size={14} className="text-stone-light" />
            <h2 className="text-sm font-semibold text-cloud">Execucoes Recentes</h2>
          </div>
          <div className="divide-y divide-night-lighter max-h-[60vh] overflow-y-auto">
            {logs.length === 0 && (
              <p className="px-4 py-6 text-xs text-stone text-center">
                Nenhuma execucao registrada ainda.
                <br />
                Triggers LIVE geram logs automaticamente ao fechar pedidos, mover estoque e criar
                avaliacoes negativas.
              </p>
            )}
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-2.5">
                <div className="flex items-start gap-2">
                  {log.status === 'success' ? (
                    <CheckCircle2 size={14} className="text-leaf mt-0.5 shrink-0" />
                  ) : (
                    <XCircle size={14} className="text-coral mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-cloud">{log.trigger_desc}</p>
                    <p className="text-[10px] text-stone-light mt-0.5">{log.action_desc}</p>
                    {log.error_message && (
                      <p className="text-[10px] text-coral mt-0.5">{log.error_message}</p>
                    )}
                    <p className="text-[10px] text-stone font-data mt-1">
                      {formatTime(log.executed_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
