'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  ScanLine,
  Scale,
  Package,
  CheckCircle2,
  AlertCircle,
  Banknote,
  CreditCard,
  QrCode,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import type { PaymentMethod } from '@txoko/shared'
import { PageHeader } from '@/components/page-header'
import {
  findOrderByCardToken,
  closeOrder,
  type CaixaOrder,
} from './actions'

type Toast = { id: number; kind: 'ok' | 'error'; text: string }

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { key: 'cash', label: 'Dinheiro', icon: <Banknote size={18} /> },
  { key: 'pix', label: 'PIX', icon: <QrCode size={18} /> },
  { key: 'credit', label: 'Credito', icon: <CreditCard size={18} /> },
  { key: 'debit', label: 'Debito', icon: <CreditCard size={18} /> },
]

export function CaixaView() {
  const [order, setOrder] = useState<CaixaOrder | null>(null)
  const [buffer, setBuffer] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [findingPending, startFinding] = useTransition()
  const [closingPending, startClosing] = useTransition()

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!order) inputRef.current?.focus()
  }, [order])

  function pushToast(kind: Toast['kind'], text: string) {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, kind, text }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }

  const handleScan = useCallback(
    (raw: string) => {
      const val = raw.trim()
      if (!val) return
      startFinding(async () => {
        const res = await findOrderByCardToken(val)
        if ('error' in res) {
          pushToast('error', res.error)
          setBuffer('')
          return
        }
        setOrder(res.order)
        setBuffer('')
      })
    },
    [startFinding],
  )

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = e.currentTarget.value
      e.currentTarget.value = ''
      setBuffer('')
      if (v.trim()) handleScan(v)
    }
  }

  function reset() {
    setOrder(null)
    setBuffer('')
    setMethod('pix')
  }

  function receive() {
    if (!order) return
    startClosing(async () => {
      const res = await closeOrder(order.order_id, method)
      if ('error' in res) {
        pushToast('error', res.error)
        return
      }
      pushToast('ok', `Comanda #${String(order.card_number).padStart(3, '0')} fechada — R$ ${order.total.toFixed(2).replace('.', ',')}`)
      reset()
    })
  }

  return (
    <div>
      <PageHeader
        title="Caixa"
        subtitle="Escaneie o QR do cartao pra fechar a comanda"
      />

      <div className="max-w-3xl mx-auto">
        {!order ? (
          <ScanBox
            inputRef={inputRef}
            buffer={buffer}
            setBuffer={setBuffer}
            onKeyDown={onInputKeyDown}
            busy={findingPending}
          />
        ) : (
          <OrderPanel
            order={order}
            method={method}
            setMethod={setMethod}
            onReceive={receive}
            onBack={reset}
            busy={closingPending}
          />
        )}
      </div>

      <div className="fixed top-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ' +
              (t.kind === 'ok'
                ? 'bg-success-soft text-success border border-success/30'
                : 'bg-destructive-soft text-destructive border border-destructive/30')
            }
          >
            {t.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}

function ScanBox({
  inputRef,
  buffer,
  setBuffer,
  onKeyDown,
  busy,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  buffer: string
  setBuffer: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  busy: boolean
}) {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-surface p-10 text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-2xl border-2 border-dashed border-border-strong flex items-center justify-center">
        {busy ? (
          <Loader2 size={32} className="text-muted animate-spin" />
        ) : (
          <ScanLine size={40} strokeWidth={1.5} className="text-muted" />
        )}
      </div>
      <div>
        <h2 className="text-xl font-semibold">Escaneie o QR da comanda</h2>
        <p className="text-sm text-muted mt-1">
          Use o leitor, camera ou digite o token manualmente
        </p>
      </div>
      <input
        ref={inputRef}
        autoFocus
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Token da comanda (32 hex) — Enter pra buscar"
        className="w-full max-w-md mx-auto block px-4 h-12 bg-bg border border-border rounded-lg font-mono text-sm focus:outline-none focus:border-primary"
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
      />
    </div>
  )
}

function OrderPanel({
  order,
  method,
  setMethod,
  onReceive,
  onBack,
  busy,
}: {
  order: CaixaOrder
  method: PaymentMethod
  setMethod: (m: PaymentMethod) => void
  onReceive: () => void
  onBack: () => void
  busy: boolean
}) {
  const modeLabel =
    order.service_mode === 'avontade'
      ? 'A Vontade'
      : order.service_mode === 'por_kg'
      ? 'Por Kg'
      : '—'

  return (
    <div className="mt-8 space-y-4">
      {/* Header da comanda */}
      <div className="rounded-2xl border border-border bg-surface p-6 flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground mb-1"
          >
            <ArrowLeft size={12} />
            Voltar
          </button>
          <div className="text-sm text-muted">Comanda</div>
          <div className="text-3xl font-bold font-mono">
            #{String(order.card_number).padStart(3, '0')}
          </div>
          <div className="text-xs text-muted mt-1">{modeLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted">Total</div>
          <div className="text-4xl font-mono font-bold">
            R$ {order.total.toFixed(2).replace('.', ',')}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <div className="text-xs uppercase tracking-wide text-muted font-semibold">
            {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
          </div>
        </div>
        <ul className="divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="px-5 py-3 flex items-center gap-3">
              <div
                className={
                  'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ' +
                  (item.weight_grams != null ? 'bg-warning-soft' : 'bg-primary-soft')
                }
              >
                {item.weight_grams != null ? (
                  <Scale size={16} className="text-warning" />
                ) : (
                  <Package size={16} className="text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.product_name}</div>
                <div className="text-xs text-muted font-mono">
                  {item.weight_grams != null
                    ? `${(item.weight_grams / 1000).toFixed(3).replace('.', ',')} kg × R$ ${item.unit_price.toFixed(2).replace('.', ',')}/kg`
                    : `${item.quantity} × R$ ${item.unit_price.toFixed(2).replace('.', ',')}`}
                </div>
              </div>
              <div className="font-mono font-semibold">
                R$ {item.total_price.toFixed(2).replace('.', ',')}
              </div>
            </li>
          ))}
        </ul>
        {(order.discount > 0 || order.service_fee > 0) && (
          <div className="px-5 py-3 border-t border-border text-sm space-y-1">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="font-mono">R$ {order.subtotal.toFixed(2).replace('.', ',')}</span>
            </div>
            {order.service_fee > 0 && (
              <div className="flex justify-between text-muted">
                <span>Taxa de servico</span>
                <span className="font-mono">+ R$ {order.service_fee.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
            {order.discount > 0 && (
              <div className="flex justify-between text-muted">
                <span>Desconto</span>
                <span className="font-mono">- R$ {order.discount.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metodo de pagamento */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="text-xs uppercase tracking-wide text-muted font-semibold mb-3">
          Forma de pagamento
        </div>
        <div className="grid grid-cols-4 gap-2">
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.key}
              onClick={() => setMethod(pm.key)}
              className={
                'flex flex-col items-center gap-1.5 h-20 rounded-xl border-2 transition-colors ' +
                (method === pm.key
                  ? 'border-primary bg-primary-muted text-primary'
                  : 'border-border text-muted hover:bg-surface-hover')
              }
            >
              {pm.icon}
              <span className="text-xs font-medium">{pm.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Receber */}
      <button
        onClick={onReceive}
        disabled={busy}
        className="w-full h-14 rounded-2xl bg-success text-success-foreground font-semibold text-lg hover:bg-success/90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <CheckCircle2 size={22} />
            Receber R$ {order.total.toFixed(2).replace('.', ',')}
          </>
        )}
      </button>
    </div>
  )
}
