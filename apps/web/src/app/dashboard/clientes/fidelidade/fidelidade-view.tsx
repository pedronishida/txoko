'use client'

import { useMemo, useState, useTransition } from 'react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Award, Gift, Star, TrendingUp, Trophy, X } from 'lucide-react'
import { redeemPoints } from './actions'

export type Redemption = {
  id: string
  customer_id: string
  points: number
  reward: string
  created_at: string
}

type CustomerLite = {
  id: string
  name: string
  loyalty_points: number
  total_spent?: number
  total_orders?: number
}

type Props = {
  customers: CustomerLite[]
  redemptions: Redemption[]
  pointsPer: number
}

const REWARDS = [
  { points: 200, reward: 'Chopp artesanal' },
  { points: 300, reward: 'Cafe espresso' },
  { points: 500, reward: 'Sobremesa' },
  { points: 1000, reward: '10% de desconto' },
  { points: 2000, reward: 'Jantar para dois' },
]

export function FidelidadeView({ customers, redemptions, pointsPer }: Props) {
  const [showRedeem, setShowRedeem] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [selectedReward, setSelectedReward] = useState<typeof REWARDS[number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const stats = useMemo(() => {
    const totalPoints = customers.reduce((s, c) => s + Number(c.loyalty_points), 0)
    const redeemedPoints = redemptions.reduce((s, r) => s + r.points, 0)
    return {
      totalPoints,
      redeemedPoints,
      activePoints: totalPoints,
      activeCustomers: customers.filter((c) => Number(c.loyalty_points) > 0).length,
    }
  }, [customers, redemptions])

  const topCustomers = useMemo(
    () =>
      [...customers]
        .filter((c) => Number(c.loyalty_points) > 0)
        .sort((a, b) => Number(b.loyalty_points) - Number(a.loyalty_points))
        .slice(0, 5),
    [customers]
  )

  const customerMap = useMemo(() => {
    const m = new Map<string, CustomerLite>()
    for (const c of customers) m.set(c.id, c)
    return m
  }, [customers])

  const selectedCustomer = selectedCustomerId ? customerMap.get(selectedCustomerId) : null
  const canRedeem =
    !!selectedCustomer &&
    !!selectedReward &&
    Number(selectedCustomer.loyalty_points) >= selectedReward.points

  function handleRedeem() {
    if (!selectedCustomer || !selectedReward || !canRedeem) return
    setError(null)
    startTransition(async () => {
      const res = await redeemPoints(
        selectedCustomer.id,
        selectedReward.points,
        selectedReward.reward
      )
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setShowRedeem(false)
      setSelectedCustomerId('')
      setSelectedReward(null)
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star size={16} className="text-warm" />
            <span className="text-xs text-stone">Pontos Disponiveis</span>
          </div>
          <p className="text-2xl font-bold font-data text-warm">
            {formatNumber(stats.activePoints)}
          </p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gift size={16} className="text-leaf" />
            <span className="text-xs text-stone">Pontos Resgatados</span>
          </div>
          <p className="text-2xl font-bold font-data text-leaf">
            {formatNumber(stats.redeemedPoints)}
          </p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-cloud" />
            <span className="text-xs text-stone">Total Emitido</span>
          </div>
          <p className="text-2xl font-bold font-data text-cloud">
            {formatNumber(stats.totalPoints + stats.redeemedPoints)}
          </p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Award size={16} className="text-leaf" />
            <span className="text-xs text-stone">Clientes Ativos</span>
          </div>
          <p className="text-2xl font-bold font-data text-leaf">{stats.activeCustomers}</p>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={() => {
            setError(null)
            setShowRedeem(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors"
        >
          <Gift size={16} /> Resgatar Pontos
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-3 border-b border-night-lighter">
            <h2 className="text-sm font-semibold text-cloud">Regras de Pontuacao</h2>
          </div>
          <div className="p-5">
            <div className="bg-leaf/5 border border-primary/20 rounded-lg p-4 mb-4 text-center">
              <p className="text-sm text-cloud">
                A cada{' '}
                <span className="font-bold text-leaf font-data">
                  {formatCurrency(pointsPer)}
                </span>{' '}
                gasto
              </p>
              <p className="text-2xl font-bold text-leaf font-data mt-1">= 1 ponto</p>
              <p className="text-[10px] text-stone mt-2">
                Aplicado automaticamente ao fechar pedido com cliente vinculado.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-stone font-medium mb-2">Recompensas disponiveis:</p>
              {REWARDS.map((r) => (
                <div
                  key={r.points}
                  className="flex items-center justify-between bg-night rounded-lg px-3 py-2"
                >
                  <span className="text-xs text-cloud">{r.reward}</span>
                  <span className="text-xs font-data text-warm font-medium">
                    {formatNumber(r.points)} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
            <Trophy size={16} className="text-warm" />
            <h2 className="text-sm font-semibold text-cloud">Top Clientes por Pontos</h2>
          </div>
          <div className="divide-y divide-night-lighter">
            {topCustomers.length === 0 && (
              <p className="px-5 py-6 text-sm text-stone text-center">
                Ainda nao ha clientes com pontos
              </p>
            )}
            {topCustomers.map((c, i) => (
              <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0
                      ? 'bg-warm/20 text-warm'
                      : i === 1
                      ? 'bg-stone-light/20 text-stone-light'
                      : 'bg-night-lighter text-stone'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cloud truncate">{c.name}</p>
                  <p className="text-[10px] text-stone">
                    {c.total_orders ?? 0} pedidos —{' '}
                    {formatCurrency(Number(c.total_spent ?? 0))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-data font-bold text-warm">
                    {formatNumber(Number(c.loyalty_points))}
                  </p>
                  <p className="text-[10px] text-stone">pontos</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
            <Gift size={16} className="text-leaf" />
            <h2 className="text-sm font-semibold text-cloud">Resgates Recentes</h2>
          </div>
          <div className="divide-y divide-night-lighter max-h-96 overflow-y-auto">
            {redemptions.length === 0 && (
              <p className="px-5 py-6 text-sm text-stone text-center">
                Nenhum resgate registrado
              </p>
            )}
            {redemptions.map((r) => {
              const customer = customerMap.get(r.customer_id)
              return (
                <div key={r.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-cloud">{customer?.name ?? 'Cliente removido'}</p>
                    <span className="text-xs font-data text-coral">
                      -{formatNumber(r.points)} pts
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-leaf">{r.reward}</p>
                    <p className="text-[10px] text-stone font-data">
                      {new Date(r.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showRedeem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
              <h2 className="font-semibold text-cloud">Resgatar Pontos</h2>
              <button
                onClick={() => setShowRedeem(false)}
                className="p-1 text-stone hover:text-cloud"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="px-3 py-2 bg-coral/10 border border-coral/30 rounded-lg text-xs text-coral">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm text-stone-light mb-1">Cliente</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="">Selecionar...</option>
                  {customers
                    .filter((c) => Number(c.loyalty_points) > 0)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({formatNumber(Number(c.loyalty_points))} pts)
                      </option>
                    ))}
                </select>
              </div>

              {selectedCustomer && (
                <div>
                  <p className="text-xs text-stone mb-2">Recompensa</p>
                  <div className="space-y-2">
                    {REWARDS.map((r) => {
                      const disabled = Number(selectedCustomer.loyalty_points) < r.points
                      const active = selectedReward?.reward === r.reward
                      return (
                        <button
                          key={r.points}
                          disabled={disabled}
                          onClick={() => setSelectedReward(r)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors border ${
                            active
                              ? 'bg-leaf/10 border-primary/30'
                              : 'bg-night border-night-lighter hover:border-stone'
                          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <span className="text-xs text-cloud">{r.reward}</span>
                          <span className="text-xs font-data text-warm font-medium">
                            {formatNumber(r.points)} pts
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowRedeem(false)}
                  className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm text-stone-light hover:text-cloud transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRedeem}
                  disabled={!canRedeem || pending}
                  className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {pending ? 'Resgatando...' : 'Confirmar Resgate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
