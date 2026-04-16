'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { CloseRegisterButton } from './close-button'

const METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Credito',
  debit: 'Debito',
  pix: 'Pix',
  voucher: 'Voucher',
  online: 'Online',
}

export type PaymentRow = {
  id: string
  method: string
  amount: number
  status: string
  created_at: string
  order_id: string
}

type Props = {
  initialPayments: PaymentRow[]
  todayStart: string
  restaurantId: string
}

export function CaixaView({
  initialPayments,
  todayStart,
  restaurantId,
}: Props) {
  const [payments, setPayments] = useState(initialPayments)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`caixa-payments-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const startTs = new Date(todayStart).getTime()
          setPayments((prev) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as PaymentRow
              if (new Date(row.created_at).getTime() < startTs) return prev
              return prev.some((p) => p.id === row.id) ? prev : [row, ...prev]
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as PaymentRow
              return prev.map((p) => (p.id === row.id ? row : p))
            }
            if (payload.eventType === 'DELETE') {
              const row = payload.old as PaymentRow
              return prev.filter((p) => p.id !== row.id)
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [todayStart, restaurantId])

  const approved = useMemo(
    () => payments.filter((p) => p.status === 'approved'),
    [payments]
  )
  const totalSales = approved.reduce((s, p) => s + Number(p.amount), 0)
  const cashBalance = totalSales

  const salesByMethod: Record<string, number> = {}
  for (const p of approved) {
    salesByMethod[p.method] = (salesByMethod[p.method] ?? 0) + Number(p.amount)
  }

  return (
    <div>
      {/* KPI band */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-x-8 gap-y-6 pb-8 mb-10 border-b border-night-lighter">
        <Metric label="Vendas do dia" value={formatCurrency(totalSales)} />
        <Metric label="Suprimento" value={formatCurrency(0)} tone="stone" />
        <Metric label="Sangrias" value={formatCurrency(0)} tone="stone" />
        <Metric label="Despesas" value={formatCurrency(0)} tone="stone" />
        <Metric label="Saldo em caixa" value={formatCurrency(cashBalance)} tone="leaf" />
      </section>

      {/* Sales by method */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Vendas por metodo
          </h2>
          <span className="flex items-center gap-1.5 text-[10px] text-leaf tracking-tight">
            <span className="relative flex">
              <span className="absolute inline-flex h-full w-full rounded-full bg-leaf opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-1 w-1 bg-leaf" />
            </span>
            atualiza em tempo real
          </span>
        </div>
        {Object.keys(salesByMethod).length === 0 ? (
          <p className="py-8 text-center text-[13px] text-stone tracking-tight">
            Nenhum pagamento registrado hoje
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-5">
            {Object.entries(salesByMethod).map(([method, amount]) => (
              <div key={method}>
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                  {METHOD_LABEL[method] || method}
                </p>
                <p className="text-[18px] font-medium text-cloud font-data tracking-tight mt-2">
                  {formatCurrency(amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Movements */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Movimentacoes do dia
          </h2>
          <span className="text-[11px] font-data text-stone-dark">
            {payments.length}{' '}
            {payments.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>
        {payments.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-stone tracking-tight">
            Nenhuma movimentacao registrada
          </p>
        ) : (
          <div className="divide-y divide-night-lighter">
            {payments.map((m) => {
              const time = new Date(m.created_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })
              return (
                <div
                  key={m.id}
                  className="py-3 flex items-baseline gap-4"
                >
                  <span className="text-[11px] font-data text-stone-dark w-12 shrink-0">
                    {time}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-cloud tracking-tight truncate">
                      Pagamento pedido #{m.order_id.slice(0, 6)}
                    </p>
                    <p className="text-[11px] text-stone-dark tracking-tight mt-0.5">
                      {METHOD_LABEL[m.method] ?? m.method}
                      {m.status !== 'approved' && (
                        <span className="text-warm capitalize"> · {m.status}</span>
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-[13px] font-data shrink-0',
                      m.status === 'approved' ? 'text-cloud' : 'text-stone'
                    )}
                  >
                    +{formatCurrency(Number(m.amount))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <CloseRegisterButton balance={cashBalance} />
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'leaf' | 'stone'
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
        {label}
      </p>
      <p
        className={cn(
          'text-[22px] font-medium tracking-[-0.03em] leading-none font-data mt-3',
          tone === 'neutral' && 'text-cloud',
          tone === 'leaf' && 'text-cloud',
          tone === 'stone' && 'text-stone-dark'
        )}
      >
        {value}
      </p>
    </div>
  )
}
