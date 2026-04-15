'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowUpCircle,
  Banknote,
  Clock,
  CreditCard,
  DollarSign,
  Globe,
  QrCode,
} from 'lucide-react'
import { CloseRegisterButton } from './close-button'

const METHOD_ICON: Record<string, typeof DollarSign> = {
  cash: Banknote,
  credit: CreditCard,
  debit: CreditCard,
  pix: QrCode,
  voucher: Globe,
  online: Globe,
}

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

export function CaixaView({ initialPayments, todayStart, restaurantId }: Props) {
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
              return prev.some((p) => p.id === row.id)
                ? prev
                : [row, ...prev]
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
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Vendas do Dia</p>
          <p className="text-xl font-bold font-data text-leaf">{formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Suprimento</p>
          <p className="text-xl font-bold font-data text-stone">{formatCurrency(0)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Sangrias</p>
          <p className="text-xl font-bold font-data text-stone">{formatCurrency(0)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Despesas</p>
          <p className="text-xl font-bold font-data text-stone">{formatCurrency(0)}</p>
        </div>
        <div className="bg-night-light border border-leaf/20 rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Saldo em Caixa</p>
          <p className="text-xl font-bold font-data text-leaf">{formatCurrency(cashBalance)}</p>
        </div>
      </div>

      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="px-5 py-3 border-b border-night-lighter flex items-center justify-between">
          <h2 className="text-sm font-semibold text-cloud">Vendas por Forma de Pagamento</h2>
          <span className="text-[10px] text-leaf flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-leaf animate-pulse" />
            Atualiza em tempo real
          </span>
        </div>
        {Object.keys(salesByMethod).length === 0 ? (
          <p className="px-5 py-6 text-sm text-stone text-center">
            Nenhum pagamento registrado hoje
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-night-lighter">
            {Object.entries(salesByMethod).map(([method, amount]) => {
              const Icon = METHOD_ICON[method] || DollarSign
              return (
                <div key={method} className="px-4 py-3 flex items-center gap-3">
                  <Icon size={18} className="text-stone-light" />
                  <div>
                    <p className="text-xs text-stone">{METHOD_LABEL[method] || method}</p>
                    <p className="text-sm font-bold font-data text-cloud">
                      {formatCurrency(amount)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="px-5 py-3 border-b border-night-lighter flex items-center justify-between">
          <h2 className="text-sm font-semibold text-cloud">Movimentacoes do Dia</h2>
          <span className="text-xs text-stone font-data">{payments.length} registros</span>
        </div>
        {payments.length === 0 ? (
          <p className="px-5 py-8 text-sm text-stone text-center">
            Nenhuma movimentacao registrada
          </p>
        ) : (
          <div className="divide-y divide-night-lighter max-h-96 overflow-y-auto">
            {payments.map((m) => {
              const time = new Date(m.created_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })
              return (
                <div key={m.id} className="px-5 py-2.5 flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-leaf/10">
                    <ArrowUpCircle size={16} className="text-leaf" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-cloud truncate">
                      Pagamento pedido #{m.order_id.slice(0, 6)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-stone font-data flex items-center gap-1">
                        <Clock size={10} />
                        {time}
                      </span>
                      <span className="text-[10px] text-stone capitalize">
                        {METHOD_LABEL[m.method] ?? m.method}
                      </span>
                      {m.status !== 'approved' && (
                        <span className="text-[10px] text-warm capitalize">{m.status}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-sm font-data font-semibold',
                      m.status === 'approved' ? 'text-leaf' : 'text-stone'
                    )}
                  >
                    +{formatCurrency(Number(m.amount))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <CloseRegisterButton balance={cashBalance} />
    </div>
  )
}
