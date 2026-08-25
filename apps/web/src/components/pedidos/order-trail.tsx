'use client'

import { useEffect, useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { listOrderEvents, type OrderEvent } from '@/app/(app)/pedidos/actions'

const ACTION_LABEL: Record<string, string> = {
  cancelled: 'Cancelado',
  refunded: 'Estorno emitido',
}

function describe(e: OrderEvent): string {
  if (e.action === 'refunded') {
    const amount = Number(e.metadata?.amount ?? 0)
    return amount > 0
      ? `Estorno de ${formatCurrency(amount)} emitido`
      : 'Estorno emitido'
  }
  const base = ACTION_LABEL[e.action] ?? e.action
  return e.reason ? `${base} · ${e.reason.toLowerCase()}` : base
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Trilha do pedido: horario, o que aconteceu e quem autorizou.
 *
 * Sem ator, o evento e automatico — integracao, gatilho ou rotina. E o que
 * responde "quem mandou cancelar isso" depois que o turno acabou.
 */
export function OrderTrail({
  orderId,
  refreshKey = 0,
}: {
  orderId: string
  refreshKey?: number
}) {
  const [events, setEvents] = useState<OrderEvent[] | null>(null)

  useEffect(() => {
    let alive = true
    setEvents(null)
    void listOrderEvents(orderId).then((rows) => {
      if (alive) setEvents(rows)
    })
    return () => {
      alive = false
    }
  }, [orderId, refreshKey])

  if (events === null) {
    return (
      <div className="flex flex-col gap-2.5" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="grid grid-cols-[36px_1fr] gap-2.5">
            <div className="skeleton h-[9px] w-8" />
            <div className="min-w-0">
              <div className="skeleton h-[10px] w-[60%]" />
              <div className="skeleton mt-1.5 h-[9px] w-[40%]" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <p className="text-[11.5px] leading-relaxed text-ink-muted">
        Nada registrado ainda. Cancelamentos e estornos aparecem aqui com o
        motivo e quem autorizou.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {events.map((e) => (
        <div key={e.id} className="grid grid-cols-[36px_1fr] items-start gap-2.5">
          <span className="pt-0.5 font-data text-[10.5px] text-ink-muted">
            {hhmm(e.at)}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                'text-xs leading-snug',
                e.action === 'cancelled' || e.action === 'refunded'
                  ? 'text-red'
                  : 'text-ink'
              )}
            >
              {describe(e)}
            </p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">
              {e.actor_name
                ? `${e.actor_name}${e.actor_role ? ` · ${e.actor_role}` : ''}`
                : 'automatico'}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
