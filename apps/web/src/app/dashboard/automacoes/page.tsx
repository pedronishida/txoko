'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { MOCK_AUTOMATIONS, MOCK_AUTOMATION_LOGS, AREA_CONFIG, type Automation } from '@/lib/mock-automations'
import { Zap, Play, CheckCircle2, XCircle, Clock, ToggleLeft, ToggleRight } from 'lucide-react'

type AreaFilter = 'all' | string

export default function AutomacoesPage() {
  const [automations, setAutomations] = useState(MOCK_AUTOMATIONS)
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all')

  const filtered = useMemo(() => {
    if (areaFilter === 'all') return automations
    return automations.filter(a => a.area === areaFilter)
  }, [automations, areaFilter])

  const activeCount = automations.filter(a => a.enabled).length
  const totalExec = automations.reduce((s, a) => s + a.executionsToday, 0)
  const areas = [...new Set(automations.map(a => a.area))]

  function toggleAutomation(id: string) {
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a))
  }

  function formatTime(ts: string) {
    const d = new Date(ts)
    const mins = Math.floor((Date.now() - d.getTime()) / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min atras`
    return `${Math.floor(mins / 60)}h atras`
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
            <p className="text-sm text-stone">Gatilhos automaticos que eliminam trabalho manual</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone">Automacoes Ativas</p>
          <p className="text-2xl font-bold font-data text-leaf">{activeCount} <span className="text-sm text-stone font-normal">/ {automations.length}</span></p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone">Execucoes Hoje</p>
          <p className="text-2xl font-bold font-data text-warm">{totalExec}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone">Taxa de Sucesso</p>
          <p className="text-2xl font-bold font-data text-leaf">98.7%</p>
        </div>
      </div>

      {/* Area Filters */}
      <div className="flex items-center gap-2">
        <button onClick={() => setAreaFilter('all')} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', areaFilter === 'all' ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light border border-night-lighter')}>
          Todas
        </button>
        {areas.map(area => {
          const cfg = AREA_CONFIG[area]
          return (
            <button key={area} onClick={() => setAreaFilter(area === areaFilter ? 'all' : area)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', areaFilter === area ? cfg?.color || 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light border border-night-lighter')}>
              {cfg?.label || area}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Automations List */}
        <div className="lg:col-span-2 space-y-2">
          {filtered.map(auto => {
            const areaCfg = AREA_CONFIG[auto.area]
            return (
              <div key={auto.id} className={cn('bg-night-light border rounded-xl p-4 transition-colors', auto.enabled ? 'border-night-lighter' : 'border-night-lighter/50 opacity-60')}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', areaCfg?.color || 'bg-stone/10 text-stone')}>
                        {areaCfg?.label || auto.area}
                      </span>
                      {auto.executionsToday > 0 && (
                        <span className="text-[10px] text-stone font-data flex items-center gap-0.5">
                          <Play size={10} /> {auto.executionsToday}x hoje
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
                    onClick={() => toggleAutomation(auto.id)}
                    className={cn('p-1 transition-colors', auto.enabled ? 'text-leaf' : 'text-stone')}
                  >
                    {auto.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Recent Logs */}
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-4 py-3 border-b border-night-lighter flex items-center gap-2">
            <Clock size={14} className="text-stone-light" />
            <h2 className="text-sm font-semibold text-cloud">Execucoes Recentes</h2>
          </div>
          <div className="divide-y divide-night-lighter max-h-[60vh] overflow-y-auto">
            {MOCK_AUTOMATION_LOGS.map(log => (
              <div key={log.id} className="px-4 py-2.5">
                <div className="flex items-start gap-2">
                  {log.status === 'success' ? (
                    <CheckCircle2 size={14} className="text-leaf mt-0.5 shrink-0" />
                  ) : (
                    <XCircle size={14} className="text-coral mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-cloud">{log.trigger}</p>
                    <p className="text-[10px] text-stone-light mt-0.5">{log.action}</p>
                    <p className="text-[10px] text-stone font-data mt-1">{formatTime(log.timestamp)}</p>
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
