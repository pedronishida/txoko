'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { MetricBand } from '@/components/metric-band'
import { TabBar } from '@/components/tab-bar'
import { EmptyState } from '@/components/states'
import { Modal } from '@/components/modal'
import {
  setProductStockControl,
  recordMovement,
  adjustToCount,
  listMovements,
  type MovementKind,
  type StockMovement,
} from './actions'

export type StockProduct = {
  id: string
  name: string
  barcode: string | null
  price: number
  stock_tracked: boolean
  stock_quantity: number | null
  stock_min: number | null
  category_id: string | null
}

type Filter = 'tracked' | 'low' | 'untracked' | 'all'

const MOVEMENT_LABEL: Record<string, string> = {
  sale: 'Venda',
  purchase: 'Entrada',
  adjustment: 'Ajuste',
  loss: 'Perda',
  return: 'Devolucao',
}

/** Sem minimo definido nao ha "baixo" — so saldo. */
function isLow(p: StockProduct): boolean {
  return (
    p.stock_tracked &&
    p.stock_min != null &&
    p.stock_quantity != null &&
    p.stock_quantity <= p.stock_min
  )
}

export function ProdutosEstoqueView({ products }: { products: StockProduct[] }) {
  const [filter, setFilter] = useState<Filter>('tracked')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StockProduct | null>(null)

  const counts = useMemo(
    () => ({
      all: products.length,
      tracked: products.filter((p) => p.stock_tracked).length,
      untracked: products.filter((p) => !p.stock_tracked).length,
      low: products.filter(isLow).length,
    }),
    [products]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (filter === 'tracked' && !p.stock_tracked) return false
      if (filter === 'untracked' && p.stock_tracked) return false
      if (filter === 'low' && !isLow(p)) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
      )
    })
  }, [products, filter, search])

  return (
    <div>
      <MetricBand
        metrics={[
          { label: 'Com controle', value: String(counts.tracked) },
          {
            label: 'Abaixo do minimo',
            value: String(counts.low),
            tone: counts.low > 0 ? 'negative' : 'neutral',
          },
          { label: 'Sem controle', value: String(counts.untracked) },
        ]}
        columns={3}
      />

      <PageHeader
        title="Estoque por produto"
        subtitle="Itens vendidos por unidade. O saldo baixa sozinho quando o pedido fecha e volta se ele for cancelado."
        border={false}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <TabBar
          variant="chip"
          size="dense"
          aria-label="Filtro de produtos"
          tabs={[
            { key: 'tracked', label: 'Com controle', count: counts.tracked },
            { key: 'low', label: 'Abaixo do minimo', count: counts.low },
            { key: 'untracked', label: 'Sem controle', count: counts.untracked },
            { key: 'all', label: 'Todos', count: counts.all },
          ]}
          active={filter}
          onChange={(k) => setFilter(k as Filter)}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou codigo"
          aria-label="Buscar produto"
          className="h-10 w-64 rounded-[10px] border border-rule bg-field px-3 text-[13px] text-ink placeholder:text-ink-muted"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum produto neste filtro"
          hint={
            filter === 'tracked'
              ? 'Nenhum produto controla estoque ainda. Abra um item em "Sem controle" e ligue o controle.'
              : 'Troque o filtro ou limpe a busca.'
          }
        />
      ) : (
        <div className="divide-y divide-rule-faint">
          {filtered.map((p) => {
            const low = isLow(p)
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="flex w-full items-center gap-4 px-2 py-3 text-left transition-colors hover:bg-sunken"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {p.name}
                  </span>
                  <span className="mt-0.5 block font-data text-[11px] text-ink-muted">
                    {p.barcode ?? 'sem codigo'} · {formatCurrency(p.price)}
                  </span>
                </span>

                {p.stock_tracked ? (
                  <>
                    <span className="shrink-0 text-right">
                      <span
                        className={cn(
                          'block font-data text-[15px] font-semibold',
                          // Negativo nao e erro do sistema: e a contagem
                          // avisando que esta errada.
                          (p.stock_quantity ?? 0) < 0
                            ? 'text-red'
                            : low
                              ? 'text-amber-text'
                              : 'text-ink'
                        )}
                      >
                        {p.stock_quantity ?? 0}
                      </span>
                      <span className="block font-data text-[10px] text-ink-muted">
                        min {p.stock_min ?? '—'}
                      </span>
                    </span>
                    {low && (
                      <span className="shrink-0 rounded-[6px] bg-sunken px-2.5 py-1 text-[11px] font-bold text-amber-text">
                        Repor
                      </span>
                    )}
                  </>
                ) : (
                  <span className="shrink-0 text-[11px] text-ink-muted">
                    sem controle
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <ProductStockModal
          product={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- */

function ProductStockModal({
  product,
  onClose,
}: {
  product: StockProduct
  onClose: () => void
}) {
  const [tab, setTab] = useState<'movimento' | 'historico' | 'ajustes'>(
    product.stock_tracked ? 'movimento' : 'ajustes'
  )
  const [movements, setMovements] = useState<StockMovement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function loadHistory() {
    setTab('historico')
    if (movements) return
    void listMovements(product.id).then(setMovements)
  }

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) {
        setError(res.error)
        return
      }
      setMovements(null)
      onClose()
    })
  }

  return (
    <Modal label={`Estoque de ${product.name}`} onClose={onClose} className="max-w-[520px]">
      <div className="shrink-0 border-b border-rule px-6 py-5">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
          {product.name}
        </h2>
        <p className="mt-1 font-data text-[11px] text-ink-muted">
          {product.barcode ?? 'sem codigo'} · saldo{' '}
          {product.stock_tracked ? (product.stock_quantity ?? 0) : '—'}
        </p>
      </div>

      <div className="shrink-0 border-b border-rule px-6 pt-4">
        <TabBar
          tabs={[
            ...(product.stock_tracked
              ? [
                  { key: 'movimento', label: 'Lancar' },
                  { key: 'historico', label: 'Historico' },
                ]
              : []),
            { key: 'ajustes', label: 'Controle' },
          ]}
          active={tab}
          onChange={(k) => (k === 'historico' ? loadHistory() : setTab(k as typeof tab))}
        />
      </div>

      <div className="thin-scroll min-h-[220px] flex-1 overflow-y-auto px-6 py-5">
        {tab === 'movimento' && (
          <MovementForm
            pending={pending}
            onSubmit={(kind, qty, note) =>
              run(() =>
                recordMovement({ productId: product.id, kind, quantity: qty, note })
              )
            }
            onCount={(counted, note) =>
              run(() => adjustToCount({ productId: product.id, counted, note }))
            }
          />
        )}

        {tab === 'historico' && <History movements={movements} />}

        {tab === 'ajustes' && (
          <ControlForm
            product={product}
            pending={pending}
            onSubmit={(tracked, min) =>
              run(() =>
                setProductStockControl({ productId: product.id, tracked, min })
              )
            }
          />
        )}

        {error && (
          <p role="alert" className="mt-4 text-[12px] leading-relaxed text-red">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-rule px-6 py-4">
        <button
          onClick={onClose}
          className="h-11 w-full rounded-[11px] border border-rule text-[13px] font-semibold text-ink hover:bg-sunken"
        >
          Fechar
        </button>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- */

function MovementForm({
  pending,
  onSubmit,
  onCount,
}: {
  pending: boolean
  onSubmit: (kind: MovementKind, qty: number, note: string | null) => void
  onCount: (counted: number, note: string | null) => void
}) {
  const [kind, setKind] = useState<MovementKind | 'count'>('purchase')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')

  const n = Number(qty)
  const valid = Number.isInteger(n) && (kind === 'count' ? n >= 0 : n > 0)

  const OPTIONS: { key: MovementKind | 'count'; label: string; hint: string }[] = [
    { key: 'purchase', label: 'Entrada', hint: 'Chegou mercadoria do fornecedor' },
    { key: 'loss', label: 'Perda', hint: 'Quebra, vencimento, cortesia' },
    { key: 'count', label: 'Contagem', hint: 'Informe o saldo contado na prateleira' },
  ]

  return (
    <div>
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        Tipo
      </p>
      <div className="mb-5 flex flex-col gap-1.5">
        {OPTIONS.map((o) => {
          const on = kind === o.key
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setKind(o.key)}
              aria-pressed={on}
              className={cn(
                'flex min-h-11 items-center gap-2.5 rounded-[11px] border px-3.5 text-left transition-colors',
                on ? 'border-teal bg-teal-soft' : 'border-rule hover:bg-sunken'
              )}
            >
              <span
                className={cn(
                  'h-[15px] w-[15px] shrink-0 rounded-full border-[1.5px]',
                  on ? 'border-teal bg-teal' : 'border-rule'
                )}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-[13px] font-semibold',
                    on ? 'text-teal-deep' : 'text-ink'
                  )}
                >
                  {o.label}
                </span>
                <span className="block text-[11.5px] text-ink-muted">{o.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        {kind === 'count' ? 'Saldo contado' : 'Quantidade'}
      </label>
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
        inputMode="numeric"
        placeholder="0"
        aria-label={kind === 'count' ? 'Saldo contado' : 'Quantidade'}
        className="h-11 w-full rounded-[11px] border border-rule bg-field px-3.5 font-data text-[15px] text-ink"
      />

      <label className="mb-2 mt-4 block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        Observacao
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Opcional — nota fiscal, motivo da perda"
        aria-label="Observacao"
        className="h-11 w-full rounded-[11px] border border-rule bg-field px-3.5 text-[13px] text-ink placeholder:text-ink-muted"
      />

      <button
        type="button"
        disabled={!valid || pending}
        onClick={() =>
          kind === 'count'
            ? onCount(n, note.trim() || null)
            : onSubmit(kind, n, note.trim() || null)
        }
        className={cn(
          'mt-5 h-12 w-full rounded-[13px] text-sm font-bold transition-colors',
          !valid || pending
            ? 'cursor-not-allowed bg-sunken text-ink-muted'
            : 'bg-teal text-on-teal hover:bg-teal-deep'
        )}
      >
        {pending ? 'Lancando…' : 'Lancar movimento'}
      </button>
      {!valid && qty !== '' && (
        <p className="mt-2 text-[11.5px] text-ink-soft">
          {kind === 'count'
            ? 'O saldo contado precisa ser inteiro e nao negativo.'
            : 'A quantidade precisa ser inteira e maior que zero.'}
        </p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- */

function History({ movements }: { movements: StockMovement[] | null }) {
  if (movements === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-9 w-full" />
        ))}
      </div>
    )
  }
  if (movements.length === 0) {
    return (
      <EmptyState
        title="Nenhum movimento ainda"
        hint="Entradas, perdas, vendas e devolucoes aparecem aqui com o saldo depois de cada uma."
      />
    )
  }
  return (
    <div className="divide-y divide-rule-faint">
      {movements.map((m) => (
        <div key={m.id} className="flex items-baseline gap-3 py-2.5">
          <span className="w-[92px] shrink-0 font-data text-[11px] text-ink-muted">
            {new Date(m.at).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] text-ink">
              {MOVEMENT_LABEL[m.kind] ?? m.kind}
            </span>
            {m.note && (
              <span className="block truncate text-[11px] text-ink-muted">
                {m.note}
              </span>
            )}
          </span>
          <span
            className={cn(
              'w-12 shrink-0 text-right font-data text-[13px] font-semibold',
              m.quantity < 0 ? 'text-red' : 'text-teal-deep'
            )}
          >
            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
          </span>
          <span className="w-10 shrink-0 text-right font-data text-[13px] text-ink-muted">
            {m.balance_after}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- */

function ControlForm({
  product,
  pending,
  onSubmit,
}: {
  product: StockProduct
  pending: boolean
  onSubmit: (tracked: boolean, min: number | null) => void
}) {
  const [tracked, setTracked] = useState(product.stock_tracked)
  const [min, setMin] = useState(
    product.stock_min != null ? String(product.stock_min) : ''
  )

  return (
    <div>
      <button
        type="button"
        onClick={() => setTracked((v) => !v)}
        aria-pressed={tracked}
        className="flex min-h-11 w-full items-center gap-3 rounded-[11px] border border-rule px-3.5 py-2.5 text-left transition-colors hover:bg-sunken"
      >
        <span
          className={cn(
            'flex h-[26px] w-11 shrink-0 items-center rounded-full px-[3px] transition-colors',
            tracked ? 'justify-end bg-teal' : 'justify-start bg-rule'
          )}
        >
          <span
            className="h-5 w-5 rounded-full bg-overlay"
            style={{ boxShadow: 'var(--e1)' }}
          />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-ink">
            Controlar estoque deste produto
          </span>
          <span className="block text-[11.5px] text-ink-muted">
            O PDV passa a bloquear a venda quando o saldo chegar a zero.
          </span>
        </span>
      </button>

      {tracked && (
        <>
          <label className="mb-2 mt-5 block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            Minimo para alertar
          </label>
          <input
            value={min}
            onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="Deixe vazio para nao alertar"
            aria-label="Minimo para alertar"
            className="h-11 w-full rounded-[11px] border border-rule bg-field px-3.5 font-data text-[15px] text-ink placeholder:font-sans placeholder:text-[13px] placeholder:text-ink-muted"
          />
          {!product.stock_tracked && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
              O saldo comeca em zero. Use a aba Lancar para dar a entrada
              inicial, ou uma contagem — assim o historico bate com o saldo
              desde o primeiro dia.
            </p>
          )}
        </>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => onSubmit(tracked, min === '' ? null : Number(min))}
        className={cn(
          'mt-5 h-12 w-full rounded-[13px] text-sm font-bold transition-colors',
          pending
            ? 'cursor-not-allowed bg-sunken text-ink-muted'
            : 'bg-teal text-on-teal hover:bg-teal-deep'
        )}
      >
        {pending ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  )
}
