'use client'

import { useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'
import { cancelOrderWithRefund } from '@/app/(app)/pedidos/actions'

// Lista fechada: motivo digitado a mao vira campo vazio no relatorio.
const REASONS = [
  'Cliente desistiu',
  'Erro de lancamento',
  'Item indisponivel',
  'Problema na entrega',
]

// O aviso muda com o que ja aconteceu com o pedido — cancelar algo em preparo
// nao custa o mesmo que cancelar algo que ninguem tocou.
const WARNING: Record<string, string> = {
  open: 'Nada foi enviado a cozinha ainda. O cancelamento e imediato.',
  in_kitchen:
    'Itens ja estao em preparo. A cozinha sera avisada e o insumo entra como perda.',
  preparing:
    'Itens ja estao em preparo. A cozinha sera avisada e o insumo entra como perda.',
  ready:
    'O pedido ja esta pronto para sair. Confirme com a cozinha antes de cancelar.',
}

const DEFAULT_WARNING =
  'Este pedido ja foi concluido. O cancelamento gera apenas o estorno.'

export function CancelOrderModal({
  orderId,
  orderStatus,
  orderTotal,
  sourceLabel,
  canCancel,
  onClose,
  onCancelled,
}: {
  orderId: string
  orderStatus: string
  orderTotal: number
  sourceLabel: string
  /** Falso quando o usuario nao e owner nem manager. */
  canCancel: boolean
  onClose: () => void
  onCancelled: () => void
}) {
  const [reason, setReason] = useState<string | null>(null)
  const [refund, setRefund] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const missing = !canCancel
    ? 'Cancelar pedido exige um usuario com papel de gerente ou dono.'
    : !reason
      ? 'Escolha o motivo para liberar o cancelamento.'
      : null

  const blocked = missing !== null || pending

  function confirm() {
    if (blocked || !reason) return
    setError(null)
    startTransition(async () => {
      const res = await cancelOrderWithRefund(orderId, reason, refund)
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      onCancelled()
    })
  }

  return (
    <Modal label="Cancelar pedido" onClose={onClose} className="max-w-[470px]">
      <div className="shrink-0 border-b border-rule px-[22px] py-5">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
          Cancelar pedido
        </h2>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-[22px] py-5">
        <div className="mb-5 rounded-xl border border-red bg-red-tint px-[15px] py-3.5">
          <p className="text-xs leading-relaxed text-red">
            {WARNING[orderStatus] ?? DEFAULT_WARNING}
          </p>
        </div>

        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Motivo <span className="text-red">·</span> obrigatorio
        </p>
        <div className="mb-[22px] flex flex-col gap-1.5">
          {REASONS.map((r) => {
            const on = reason === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                aria-pressed={on}
                className={cn(
                  'flex min-h-11 items-center gap-2.5 rounded-[11px] border px-3.5 text-left text-[13px] font-medium transition-colors',
                  on
                    ? 'border-teal bg-teal-soft text-teal-deep'
                    : 'border-rule text-ink-soft hover:bg-sunken'
                )}
              >
                <span
                  className={cn(
                    'h-[15px] w-[15px] shrink-0 rounded-full border-[1.5px]',
                    on ? 'border-teal bg-teal' : 'border-rule'
                  )}
                />
                {r}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setRefund((v) => !v)}
          aria-pressed={refund}
          className="mb-2.5 flex min-h-11 w-full items-center gap-3 rounded-[11px] border border-rule px-3.5 py-2.5 text-left transition-colors hover:bg-sunken"
        >
          <span
            className={cn(
              'flex h-[21px] w-9 shrink-0 items-center rounded-full px-0.5 transition-colors',
              refund ? 'justify-end bg-teal' : 'justify-start bg-rule'
            )}
          >
            <span
              className="h-[17px] w-[17px] rounded-full bg-overlay"
              style={{ boxShadow: 'var(--e1)' }}
            />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-ink">
              Estornar {formatCurrency(orderTotal)}
            </span>
            <span className="mt-px block text-[11.5px] text-ink-muted">
              De volta pelo mesmo metodo · {sourceLabel}
            </span>
          </span>
        </button>

        {error && (
          <p role="alert" className="mt-3 text-[12px] leading-relaxed text-red">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-rule px-[22px] pb-5 pt-4">
        {/* Estado so pintado nao comunica nada a quem usa teclado: o botao fica
            realmente desabilitado e a linha acima nomeia o que falta. */}
        {missing && (
          <p className="mb-3 text-[11.5px] leading-relaxed text-ink-soft">
            {missing}
          </p>
        )}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-[13px] border border-rule px-[22px] text-[13.5px] font-semibold text-ink transition-colors hover:bg-sunken"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={blocked}
            className={cn(
              'h-12 rounded-[13px] text-sm font-bold transition-colors',
              blocked
                ? 'cursor-not-allowed bg-sunken text-ink-muted'
                : 'bg-red text-on-red hover:opacity-90'
            )}
          >
            {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
