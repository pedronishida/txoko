'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Star, Trophy, Gift, TrendingUp, Award } from 'lucide-react'

const MOCK_REDEMPTIONS = [
  { id: 'r-1', customer: 'Pedro Henrique Lima', points: 500, reward: 'Sobremesa gratis', date: '2026-04-05' },
  { id: 'r-2', customer: 'Ricardo Mendes', points: 1000, reward: '10% desconto na conta', date: '2026-04-03' },
  { id: 'r-3', customer: 'Ana Carolina Silva', points: 300, reward: 'Cafe espresso gratis', date: '2026-04-01' },
  { id: 'r-4', customer: 'Roberto Almeida', points: 500, reward: 'Sobremesa gratis', date: '2026-03-28' },
  { id: 'r-5', customer: 'Carlos Eduardo Santos', points: 200, reward: 'Chopp artesanal', date: '2026-03-25' },
]

export default function FidelidadePage() {
  const { customers } = useStore()

  const stats = useMemo(() => {
    const totalPoints = customers.reduce((s, c) => s + c.loyalty_points, 0)
    const redeemedPoints = MOCK_REDEMPTIONS.reduce((s, r) => s + r.points, 0)
    return {
      totalPoints,
      redeemedPoints,
      activePoints: totalPoints - redeemedPoints,
      activeCustomers: customers.filter(c => c.loyalty_points > 0).length,
    }
  }, [customers])

  const topCustomers = useMemo(() => {
    return [...customers].sort((a, b) => b.loyalty_points - a.loyalty_points).slice(0, 5)
  }, [customers])

  const REWARDS = [
    { points: 200, reward: 'Chopp artesanal', icon: '🍺' },
    { points: 300, reward: 'Cafe espresso gratis', icon: '☕' },
    { points: 500, reward: 'Sobremesa gratis', icon: '🍰' },
    { points: 1000, reward: '10% desconto na conta', icon: '💰' },
    { points: 2000, reward: 'Jantar para 2 pessoas', icon: '🍽️' },
  ]

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><Star size={16} className="text-warm" /><span className="text-xs text-stone">Pontos Emitidos</span></div>
          <p className="text-2xl font-bold font-data text-warm">{formatNumber(stats.totalPoints)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><Gift size={16} className="text-leaf" /><span className="text-xs text-stone">Pontos Resgatados</span></div>
          <p className="text-2xl font-bold font-data text-leaf">{formatNumber(stats.redeemedPoints)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-cloud" /><span className="text-xs text-stone">Pontos Ativos</span></div>
          <p className="text-2xl font-bold font-data text-cloud">{formatNumber(stats.activePoints)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><Award size={16} className="text-leaf" /><span className="text-xs text-stone">Clientes Ativos</span></div>
          <p className="text-2xl font-bold font-data text-leaf">{stats.activeCustomers}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Rules */}
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-3 border-b border-night-lighter">
            <h2 className="text-sm font-semibold text-cloud">Regras de Pontuacao</h2>
          </div>
          <div className="p-5">
            <div className="bg-leaf/5 border border-leaf/20 rounded-lg p-4 mb-4 text-center">
              <p className="text-sm text-cloud">A cada <span className="font-bold text-leaf font-data">R$ 1,00</span> gasto</p>
              <p className="text-2xl font-bold text-leaf font-data mt-1">= 1 ponto</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-stone font-medium mb-2">Recompensas disponiveis:</p>
              {REWARDS.map(r => (
                <div key={r.points} className="flex items-center justify-between bg-night rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{r.icon}</span>
                    <span className="text-xs text-cloud">{r.reward}</span>
                  </div>
                  <span className="text-xs font-data text-warm font-medium">{formatNumber(r.points)} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Customers */}
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
            <Trophy size={16} className="text-warm" />
            <h2 className="text-sm font-semibold text-cloud">Top Clientes por Pontos</h2>
          </div>
          <div className="divide-y divide-night-lighter">
            {topCustomers.map((c, i) => (
              <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-warm/20 text-warm' : i === 1 ? 'bg-stone-light/20 text-stone-light' : 'bg-night-lighter text-stone'
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cloud truncate">{c.name}</p>
                  <p className="text-[10px] text-stone">{c.total_orders} pedidos — {formatCurrency(c.total_spent)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-data font-bold text-warm">{formatNumber(c.loyalty_points)}</p>
                  <p className="text-[10px] text-stone">pontos</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Redemptions */}
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
            <Gift size={16} className="text-leaf" />
            <h2 className="text-sm font-semibold text-cloud">Resgates Recentes</h2>
          </div>
          <div className="divide-y divide-night-lighter">
            {MOCK_REDEMPTIONS.map(r => (
              <div key={r.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-cloud">{r.customer}</p>
                  <span className="text-xs font-data text-coral">-{formatNumber(r.points)} pts</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-leaf">{r.reward}</p>
                  <p className="text-[10px] text-stone font-data">{new Date(r.date).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
