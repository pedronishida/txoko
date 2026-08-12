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
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import type { PaymentMethod } from '@txoko/shared'
import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/page-header'

// zxing eh client-only — dynamic import pra nao bundlar no SSR
const BackgroundCameraScanner = dynamic(
  () =>
    import('@/components/caixa/camera-scanner').then((m) => m.BackgroundCameraScanner),
  { ssr: false },
)
import {
  findOrderByCardToken,
  addBarcodeToOrder,
  cancelItemFromOrder,
  closeOrder,
  type CaixaOrder,
  type PaymentLine as ServerPaymentLine,
} from './actions'

type Toast = { id: number; kind: 'ok' | 'error'; text: string }

type PaymentLine = {
  id: string
  method: PaymentMethod
  amount: string // valor digitado pelo caixa. Pra cash, pode ser maior que o devido (troco auto)
}

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { key: 'cash', label: 'Dinheiro', icon: <Banknote size={16} /> },
  { key: 'pix', label: 'PIX', icon: <QrCode size={16} /> },
  { key: 'credit', label: 'Credito', icon: <CreditCard size={16} /> },
  { key: 'debit', label: 'Debito', icon: <CreditCard size={16} /> },
]

function parseBrl(v: string): number {
  if (!v) return 0
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function formatBrl(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function newLine(method: PaymentMethod = 'pix', amount = ''): PaymentLine {
  return {
    id: Math.random().toString(36).slice(2),
    method,
    amount,
  }
}

// Calcula applied + troco pra cada linha.
// Regra: non-cash tem que ser <= restante (nao pode overpay cartao).
// Cash pode exceder — excedente vira troco.
export type LineCalc = {
  method: PaymentMethod
  amount: number // valor digitado
  applied: number // quanto vai efetivamente pro pagamento
  troco: number // excedente (so em cash)
}

function calculatePayments(
  lines: PaymentLine[],
  total: number,
): { lines: LineCalc[]; applied: number; troco: number; error: string | null } {
  let remaining = total
  let totalApplied = 0
  let totalTroco = 0
  let error: string | null = null
  const calcLines: LineCalc[] = []

  // Primeira passada: non-cash (respeita ordem do usuario)
  for (const l of lines) {
    const amount = parseBrl(l.amount)
    if (l.method === 'cash') {
      calcLines.push({ method: l.method, amount, applied: 0, troco: 0 })
      continue
    }
    const applied = amount
    if (applied > remaining + 0.001) {
      error = `${PAYMENT_METHODS.find((p) => p.key === l.method)?.label}: valor excede o restante (R$ ${formatBrl(remaining)})`
    }
    calcLines.push({ method: l.method, amount, applied, troco: 0 })
    remaining = Math.round((remaining - applied) * 100) / 100
    totalApplied += applied
  }

  // Segunda passada: cash
  for (const c of calcLines) {
    if (c.method !== 'cash') continue
    const applied = Math.min(c.amount, remaining)
    const troco = Math.round((c.amount - applied) * 100) / 100
    c.applied = Math.round(applied * 100) / 100
    c.troco = troco > 0 ? troco : 0
    remaining = Math.round((remaining - c.applied) * 100) / 100
    totalApplied += c.applied
    totalTroco += c.troco
  }

  return {
    lines: calcLines,
    applied: Math.round(totalApplied * 100) / 100,
    troco: Math.round(totalTroco * 100) / 100,
    error,
  }
}

const QR_TOKEN_RE = /^[0-9a-f]{32}$/i

export function CaixaView() {
  const [order, setOrder] = useState<CaixaOrder | null>(null)
  const [currentToken, setCurrentToken] = useState<string | null>(null)
  const [buffer, setBuffer] = useState('')
  const [lines, setLines] = useState<PaymentLine[]>([])
  const [trocoModal, setTrocoModal] = useState<{ troco: number; total: number } | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [findingPending, startFinding] = useTransition()
  const [closingPending, startClosing] = useTransition()
  const [addingPending, startAdding] = useTransition()
  const [cancelPending, startCancel] = useTransition()

  const inputRef = useRef<HTMLInputElement>(null)
  const lastScanRef = useRef<{ value: string; ts: number } | null>(null)

  // Mantem foco no input, tanto no scan inicial quanto ao carregar comanda
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
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

      // Dedup contra camera que dispara em loop
      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.value === val && now - last.ts < 2000) return
      lastScanRef.current = { value: val, ts: now }

      const isToken = QR_TOKEN_RE.test(val)

      if (!order) {
        // Sem comanda: aceita so QR token do cartao
        if (!isToken) {
          pushToast('error', 'Escaneie o QR do cartao primeiro')
          setBuffer('')
          return
        }
        startFinding(async () => {
          const res = await findOrderByCardToken(val)
          if ('error' in res) {
            pushToast('error', res.error)
            setBuffer('')
            return
          }
          setOrder(res.order)
          setCurrentToken(val.toLowerCase())
          // Inicia com 1 linha preenchida com o total
          setLines([newLine('pix', formatBrl(res.order.total))])
          setBuffer('')
        })
        return
      }

      // Comanda ja carregada: so aceita barcode de produto
      // (ignora QR token — camera pode continuar vendo o cartao do cliente)
      if (isToken) {
        setBuffer('')
        return
      }
      if (!currentToken) return

      startAdding(async () => {
        const res = await addBarcodeToOrder(currentToken, val)
        if ('error' in res) {
          pushToast('error', res.error)
          setBuffer('')
          return
        }
        setOrder(res.order)
        pushToast('ok', 'Produto adicionado')
        setBuffer('')
      })
    },
    [order, currentToken, startFinding, startAdding],
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
    setCurrentToken(null)
    setBuffer('')
    setLines([])
  }

  function receive() {
    if (!order) return
    const calc = calculatePayments(lines, order.total)
    if (calc.error) {
      pushToast('error', calc.error)
      return
    }
    if (Math.abs(calc.applied - order.total) > 0.01) {
      pushToast(
        'error',
        calc.applied < order.total
          ? `Falta R$ ${formatBrl(order.total - calc.applied)}`
          : `Erro de calculo`,
      )
      return
    }

    // Grava apenas os "applied" — valor real aplicado na comanda (sem excedente do troco)
    const payload: ServerPaymentLine[] = calc.lines
      .filter((l) => l.applied > 0)
      .map((l) => ({ method: l.method, amount: l.applied }))

    startClosing(async () => {
      const totalNow = order.total
      const cardNumber = order.card_number
      const res = await closeOrder(order.order_id, payload)
      if ('error' in res) {
        pushToast('error', res.error)
        return
      }
      if (calc.troco > 0) {
        setTrocoModal({ troco: calc.troco, total: totalNow })
      } else {
        pushToast(
          'ok',
          `Comanda #${String(cardNumber).padStart(3, '0')} fechada — R$ ${formatBrl(totalNow)}`,
        )
      }
      reset()
    })
  }

  return (
    <div>
      <PageHeader
        title="Caixa"
        subtitle="Escaneie o QR do cartao pra fechar a comanda"
      />

      <BackgroundCameraScanner onScan={handleScan} />

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
            lines={lines}
            setLines={setLines}
            onReceive={receive}
            onBack={reset}
            busy={closingPending}
            inputRef={inputRef}
            buffer={buffer}
            setBuffer={setBuffer}
            onInputKeyDown={onInputKeyDown}
            addingItem={addingPending}
            cancellingItem={cancelPending}
            onCancelItem={(itemId) => {
              if (!currentToken) return
              startCancel(async () => {
                const res = await cancelItemFromOrder(currentToken, itemId)
                if ('error' in res) {
                  pushToast('error', res.error)
                  return
                }
                setOrder(res.order)
                // Reinicia split com novo total
                setLines([newLine('pix', formatBrl(res.order.total))])
                pushToast('ok', 'Item cancelado')
              })
            }}
          />
        )}

        {trocoModal && (
          <TrocoModal
            troco={trocoModal.troco}
            total={trocoModal.total}
            onClose={() => setTrocoModal(null)}
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
                ? 'bg-success/10 text-success border border-success/30'
                : 'bg-destructive/10 text-destructive border border-destructive/30')
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

function SplitBillButton({
  total,
  onSplit,
}: {
  total: number
  onSplit: (n: number) => void
}) {
  const [open, setOpen] = useState(false)
  const options = [2, 3, 4, 5, 6]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border text-xs text-muted hover:text-foreground hover:bg-muted-subtle"
      >
        <Users size={12} />
        Dividir
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-40 w-56 rounded-xl border border-border bg-surface shadow-lg p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-muted font-semibold">
              Dividir em partes iguais
            </div>
            <div className="grid grid-cols-5 gap-1">
              {options.map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    onSplit(n)
                    setOpen(false)
                  }}
                  className="h-9 rounded-lg border border-border hover:border-primary hover:bg-primary/10 text-sm font-mono"
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted">
              Cada um paga R$ {formatBrl(total / 2)}+ (dividido por 2)
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function TrocoModal({
  troco,
  total,
  onClose,
}: {
  troco: number
  total: number
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-surface border border-border shadow-2xl p-8 text-center"
      >
        <CheckCircle2 size={48} className="text-success mx-auto mb-4" />
        <div className="text-sm text-muted">Comanda fechada — R$ {total.toFixed(2).replace('.', ',')}</div>
        <div className="mt-6 text-xs uppercase tracking-wide text-muted font-semibold">Troco</div>
        <div className="mt-1 text-5xl font-mono font-bold text-success">
          R$ {troco.toFixed(2).replace('.', ',')}
        </div>
        <button
          onClick={onClose}
          className="mt-8 w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary-hover"
        >
          OK
        </button>
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
    <div className="mt-8 rounded-xl border border-border bg-surface p-10 text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-xl border-2 border-dashed border-border-strong flex items-center justify-center">
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
        className="w-full max-w-md mx-auto block px-4 h-12 bg-night border border-border rounded-lg font-mono text-sm focus:outline-none focus:border-primary"
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
      />
    </div>
  )
}

function OrderPanel({
  order,
  lines,
  setLines,
  onReceive,
  onBack,
  busy,
  inputRef,
  buffer,
  setBuffer,
  onInputKeyDown,
  addingItem,
  cancellingItem,
  onCancelItem,
}: {
  order: CaixaOrder
  lines: PaymentLine[]
  setLines: (updater: PaymentLine[] | ((prev: PaymentLine[]) => PaymentLine[])) => void
  onReceive: () => void
  onBack: () => void
  busy: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  buffer: string
  setBuffer: (v: string) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  addingItem: boolean
  cancellingItem: boolean
  onCancelItem: (itemId: string) => void
}) {
  const calc = calculatePayments(lines, order.total)
  const diff = Math.round((order.total - calc.applied) * 100) / 100
  const canSubmit = !busy && !calc.error && Math.abs(diff) < 0.01

  function updateLine(id: string, patch: Partial<PaymentLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }
  function addLine() {
    const remaining = diff > 0 ? formatBrl(diff) : ''
    setLines((prev) => [...prev, newLine('cash', remaining)])
  }
  // Divide total em N partes iguais, PIX padrao. Ajusta o ultimo valor pra compensar centavos.
  function splitEqually(n: number) {
    if (n < 2 || n > 10) return
    const share = Math.floor((order.total / n) * 100) / 100
    const remainder = Math.round((order.total - share * n) * 100) / 100
    const arr: PaymentLine[] = Array.from({ length: n }, (_, i) => {
      const amount = i === n - 1 ? share + remainder : share
      return newLine('pix', formatBrl(amount))
    })
    setLines(arr)
  }
  const modeLabel =
    order.service_mode === 'avontade'
      ? 'A Vontade'
      : order.service_mode === 'por_kg'
      ? 'Por Kg'
      : '—'

  return (
    <div className="mt-8 space-y-4">
      {/* Header da comanda */}
      <div className="rounded-xl border border-border bg-surface p-6 flex items-center justify-between">
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
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
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
                  (item.weight_grams != null ? 'bg-accent/10' : 'bg-primary/10')
                }
              >
                {item.weight_grams != null ? (
                  <Scale size={16} className="text-accent-foreground" />
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
              <button
                onClick={() => onCancelItem(item.id)}
                disabled={cancellingItem}
                className="shrink-0 w-8 h-8 rounded-md text-muted hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 flex items-center justify-center"
                title={
                  item.weight_grams == null && item.quantity > 1
                    ? 'Decrementar 1'
                    : 'Cancelar item'
                }
              >
                <Trash2 size={14} />
              </button>
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

      {/* Adicionar produto (doce/bala/chocolate do caixa) */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wide text-muted font-semibold">
            Adicionar produto
          </div>
          {addingItem && <Loader2 size={14} className="animate-spin text-muted" />}
        </div>
        <input
          ref={inputRef}
          autoFocus
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Escaneie ou digite o codigo de barras + Enter"
          className="w-full px-4 h-11 bg-night border border-border rounded-lg font-mono text-sm focus:outline-none focus:border-primary"
          autoComplete="off"
          spellCheck={false}
          disabled={addingItem}
        />
        <p className="mt-2 text-xs text-muted">
          Itens aqui viram parte da mesma comanda antes do fechamento.
        </p>
      </div>

      {/* Formas de pagamento (split) */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-wide text-muted font-semibold">
            Formas de pagamento
          </div>
          <div className="flex items-center gap-3">
            <SplitBillButton total={order.total} onSplit={splitEqually} />
            <div
              className={
                'text-xs font-medium ' +
                (Math.abs(diff) < 0.01
                  ? 'text-success'
                  : diff > 0
                  ? 'text-accent-foreground'
                  : 'text-destructive')
              }
            >
              {Math.abs(diff) < 0.01
                ? '✓ Soma bate'
                : diff > 0
                ? `Falta R$ ${formatBrl(diff)}`
                : `Excedeu R$ ${formatBrl(-diff)}`}
            </div>
          </div>
        </div>

        <ul className="space-y-2">
          {lines.map((line, idx) => {
            const lineCalc = calc.lines[idx]
            const isCash = line.method === 'cash'
            return (
              <li
                key={line.id}
                className="rounded-xl border border-border bg-night p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  {/* Selector metodo compacto */}
                  <div className="flex gap-1">
                    {PAYMENT_METHODS.map((pm) => (
                      <button
                        key={pm.key}
                        onClick={() => updateLine(line.id, { method: pm.key })}
                        className={
                          'flex items-center gap-1 px-2 h-9 rounded-lg border text-xs font-medium transition-colors ' +
                          (line.method === pm.key
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted hover:bg-muted-subtle')
                        }
                        title={pm.label}
                      >
                        {pm.icon}
                        <span className="hidden sm:inline">{pm.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Valor */}
                  <div className="flex-1 flex items-center gap-1.5 bg-surface rounded-lg border border-border px-3 h-9">
                    <span className="text-xs text-muted">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) =>
                        updateLine(line.id, {
                          amount: e.target.value.replace(/[^\d,.]/g, ''),
                        })
                      }
                      placeholder="0,00"
                      className="flex-1 bg-transparent font-mono text-right focus:outline-none"
                      autoComplete="off"
                    />
                  </div>

                  {lines.length > 1 && (
                    <button
                      onClick={() => removeLine(line.id)}
                      className="shrink-0 w-9 h-9 rounded-lg text-muted hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
                      title="Remover"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* Feedback por linha */}
                {isCash && lineCalc && lineCalc.troco > 0 && (
                  <p className="text-[11px] text-success font-medium">
                    ✓ Aplica R$ {formatBrl(lineCalc.applied)} + troco R$ {formatBrl(lineCalc.troco)}
                  </p>
                )}
                {isCash && lineCalc && lineCalc.amount > 0 && lineCalc.troco === 0 && lineCalc.applied > 0 && (
                  <p className="text-[11px] text-muted">
                    ✓ Aplica R$ {formatBrl(lineCalc.applied)} (sem troco)
                  </p>
                )}
              </li>
            )
          })}
        </ul>

        {lines.length < 4 && (
          <button
            onClick={addLine}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-dashed border-border text-sm text-muted hover:text-primary hover:border-primary"
          >
            <Plus size={14} />
            Adicionar forma de pagamento
          </button>
        )}

        {calc.troco > 0.01 && (
          <div className="pt-3 border-t border-border flex items-center justify-between text-sm">
            <span className="text-muted">Troco total a devolver</span>
            <span className="font-mono font-semibold text-success">
              R$ {formatBrl(calc.troco)}
            </span>
          </div>
        )}
        {calc.error && (
          <p className="text-xs text-destructive">{calc.error}</p>
        )}
      </div>

      {/* Receber */}
      <button
        onClick={onReceive}
        disabled={!canSubmit}
        className="w-full h-14 rounded-xl bg-success text-white font-semibold text-lg hover:bg-success disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <CheckCircle2 size={22} />
            Receber R$ {formatBrl(order.total)}
          </>
        )}
      </button>
    </div>
  )
}
