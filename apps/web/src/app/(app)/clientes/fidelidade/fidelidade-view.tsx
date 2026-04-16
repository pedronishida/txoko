'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import { X } from 'lucide-react'
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
  const [selectedReward, setSelectedReward] = useState<
    (typeof REWARDS)[number] | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const stats = useMemo(() => {
    const totalPoints = customers.reduce(
      (s, c) => s + Number(c.loyalty_points),
      0
    )
    const redeemedPoints = redemptions.reduce((s, r) => s + r.points, 0)
    return {
      totalPoints,
      redeemedPoints,
      activePoints: totalPoints,
      activeCustomers: customers.filter((c) => Number(c.loyalty_points) > 0)
        .length,
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

  const selectedCustomer = selectedCustomerId
    ? customerMap.get(selectedCustomerId)
    : null
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
    <div>
      {/* KPI band */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-6 pb-8 mb-10 border-b border-night-lighter">
        <Metric label="Pontos disponiveis" value={formatNumber(stats.activePoints)} />
        <Metric label="Pontos resgatados" value={formatNumber(stats.redeemedPoints)} />
        <Metric
          label="Total emitido"
          value={formatNumber(stats.totalPoints + stats.redeemedPoints)}
        />
        <Metric label="Clientes ativos" value={String(stats.activeCustomers)} />
      </section>

      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="text-[13px] text-cloud tracking-tight">
            A cada{' '}
            <span className="font-data text-cloud">
              {formatCurrency(pointsPer)}
            </span>{' '}
            gasto o cliente ganha{' '}
            <span className="font-data text-cloud">1 ponto</span>
          </p>
          <p className="text-[11px] text-stone-dark tracking-tight mt-1">
            Aplicado automaticamente ao fechar pedido com cliente vinculado
          </p>
        </div>
        <button
          onClick={() => {
            setError(null)
            setShowRedeem(true)
          }}
          className="inline-flex items-center h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
        >
          Resgatar pontos
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-12 gap-y-10">
        {/* Rewards table */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-5">
            Recompensas
          </h2>
          <div className="divide-y divide-night-lighter">
            {REWARDS.map((r) => (
              <div
                key={r.points}
                className="py-3 flex items-baseline justify-between"
              >
                <span className="text-[13px] text-cloud tracking-tight">
                  {r.reward}
                </span>
                <span className="text-[12px] font-data text-stone-light">
                  {formatNumber(r.points)} pts
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Top customers */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-5">
            Top por pontos
          </h2>
          {topCustomers.length === 0 ? (
            <p className="text-[12px] text-stone tracking-tight">
              Ainda nao ha clientes com pontos
            </p>
          ) : (
            <div className="divide-y divide-night-lighter">
              {topCustomers.map((c, i) => (
                <div
                  key={c.id}
                  className="py-3 flex items-center gap-4"
                >
                  <span className="text-[11px] font-data text-stone-dark w-4">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-cloud tracking-tight truncate">
                      {c.name}
                    </p>
                    <p className="text-[10px] text-stone-dark tracking-tight mt-0.5 font-data">
                      {c.total_orders ?? 0} pedidos ·{' '}
                      {formatCurrency(Number(c.total_spent ?? 0))}
                    </p>
                  </div>
                  <span className="text-[13px] font-medium text-cloud font-data tracking-tight shrink-0">
                    {formatNumber(Number(c.loyalty_points))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent redemptions */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-5">
            Resgates recentes
          </h2>
          {redemptions.length === 0 ? (
            <p className="text-[12px] text-stone tracking-tight">
              Nenhum resgate ainda
            </p>
          ) : (
            <div className="divide-y divide-night-lighter">
              {redemptions.map((r) => {
                const customer = customerMap.get(r.customer_id)
                return (
                  <div key={r.id} className="py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] text-cloud tracking-tight truncate">
                        {customer?.name ?? 'Cliente removido'}
                      </span>
                      <span className="text-[11px] font-data text-primary shrink-0">
                        −{formatNumber(r.points)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between mt-0.5">
                      <span className="text-[11px] text-stone tracking-tight">
                        {r.reward}
                      </span>
                      <span className="text-[10px] font-data text-stone-dark">
                        {new Date(r.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Modal */}
      {showRedeem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
          onClick={() => setShowRedeem(false)}
        >
          <div
            className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between">
              <h2 className="text-[14px] font-medium text-cloud tracking-tight">
                Resgatar pontos
              </h2>
              <button
                onClick={() => setShowRedeem(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {error && (
                <div className="px-3 py-2 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                  Cliente
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
                >
                  <option value="">Selecionar</option>
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
                  <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                    Recompensa
                  </label>
                  <div className="divide-y divide-night-lighter border-y border-night-lighter">
                    {REWARDS.map((r) => {
                      const disabled =
                        Number(selectedCustomer.loyalty_points) < r.points
                      const active = selectedReward?.reward === r.reward
                      return (
                        <button
                          key={r.points}
                          disabled={disabled}
                          onClick={() => setSelectedReward(r)}
                          className={cn(
                            'w-full flex items-center justify-between py-2.5 text-left transition-colors px-2 -mx-2',
                            active && 'bg-night-lighter',
                            disabled && 'opacity-40 cursor-not-allowed'
                          )}
                        >
                          <span
                            className={cn(
                              'text-[12px] tracking-tight',
                              active ? 'text-cloud' : 'text-stone-light'
                            )}
                          >
                            {r.reward}
                          </span>
                          <span className="text-[11px] font-data text-stone-dark">
                            {formatNumber(r.points)} pts
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowRedeem(false)}
                  className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRedeem}
                  disabled={!canRedeem || pending}
                  className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
                >
                  {pending ? 'Resgatando' : 'Confirmar resgate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
        {label}
      </p>
      <p className="text-[28px] font-medium text-cloud tracking-[-0.03em] leading-none font-data mt-3">
        {value}
      </p>
    </div>
  )
}
