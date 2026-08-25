'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { Category, Product } from '@txoko/shared'
import { Search, ScanLine, Plus, Minus, X, Loader2, ShoppingCart, Clock, Printer } from 'lucide-react'
import {
  listOpenOrders,
  findOrderByCardToken,
  findOrderByCardNumber,
  findOrderByCardBarcode,
  openOrderFromCard,
  addBarcodeToOrder,
  addProductToOrder,
  setOrderItemQuantity,
  cancelItemFromOrder,
  closeOrder,
  type CaixaOrder,
  type OpenOrderSummary,
  type PaymentLine,
} from '@/app/(app)/caixa/actions'
import { cn, formatCurrency } from '@/lib/utils'
import { TabBar } from '@/components/tab-bar'
import { EmptyState } from '@/components/states'

// Camera fica ativa em background: o tablet do caixa nem sempre tem leitor
// USB. Carrega so no cliente porque depende de getUserMedia.
const BackgroundCameraScanner = dynamic(
  () =>
    import('@/components/caixa/camera-scanner').then(
      (m) => m.BackgroundCameraScanner
    ),
  { ssr: false }
)

// Venda de balcao e comanda da estacao sao a mesma coisa aqui: um pedido
// aberto que da pra editar e fechar sem trocar de tela.

const PAYMENT_METHODS: { value: PaymentLine['method']; label: string; key: string }[] = [
  { value: 'cash', label: 'Dinheiro', key: 'F5' },
  { value: 'pix', label: 'Pix', key: 'F6' },
  { value: 'credit', label: 'Credito', key: 'F7' },
  { value: 'debit', label: 'Debito', key: 'F8' },
]

// Codigo de barras do cartao: 'C' + 12 hex
const CARD_BARCODE_RE = /^C[0-9A-F]{12}$/i

// Une simbolo e valor com U+202F, como o resto do produto.
const brl = formatCurrency

function modeLabel(mode: string | null): string {
  if (mode === 'avontade') return 'A vontade'
  if (mode === 'por_kg') return 'Por quilo'
  if (mode === 'por_kg_2mix') return 'Por quilo · 2 misturas'
  return 'Balcao'
}

function sinceLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`
}

export function VendaView({
  products,
  categories,
}: {
  products: Product[]
  categories: Category[]
}) {
  const [openOrders, setOpenOrders] = useState<OpenOrderSummary[]>([])
  const [order, setOrder] = useState<CaixaOrder | null>(null)
  // Cartao valido que ainda nao tem comanda: o caixa decide se abre.
  const [pendingCard, setPendingCard] = useState<{
    qr_token: string
    card_number: number
  } | null>(null)
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | 'all'>('all')
  const [method, setMethod] = useState<PaymentLine['method']>('pix')
  // Impressao automatica ao fechar — preferencia do aparelho (o tablet da
  // estacao nao tem impressora, o caixa tem)
  const [autoPrint, setAutoPrint] = useState(true)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const searchRef = useRef<HTMLInputElement>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const notify = useCallback((kind: 'ok' | 'error', text: string) => {
    setFeedback({ kind, text })
    setTimeout(() => setFeedback(null), 3000)
  }, [])

  const refreshOrders = useCallback(async () => {
    setOpenOrders(await listOpenOrders())
  }, [])

  useEffect(() => {
    void refreshOrders()
    setAutoPrint(localStorage.getItem('txoko_pdv_auto_print') !== 'off')
  }, [refreshOrders])

  // Recarrega a comanda atual depois de cada alteracao
  const reloadOrder = useCallback(
    async (token: string) => {
      const res = await findOrderByCardToken(token)
      if ('ok' in res) setOrder(res.order)
      void refreshOrders()
    },
    [refreshOrders]
  )


  // Abre a comanda do cartao aqui no caixa, sem mandar o cliente ate a
  // balanca so pra registrar uma bebida.
  const abrirComanda = useCallback(() => {
    const alvo = pendingCard
    if (!alvo) return
    startTransition(async () => {
      const res = await openOrderFromCard(alvo.qr_token)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      setPendingCard(null)
      setOrder(res.order)
      notify('ok', `Comanda #${String(res.order.card_number).padStart(3, '0')} aberta`)
      void refreshOrders()
    })
  }, [pendingCard, notify, refreshOrders])

  // A camera dispara varias vezes por segundo — ignora repeticao em <2s
  const lastScanRef = useRef<{ value: string; ts: number } | null>(null)

  // handleScan e memoizado e a camera segura a referencia antiga; o ref
  // garante que ele enxergue sempre a comanda atual.
  const orderRef = useRef<CaixaOrder | null>(null)
  useEffect(() => {
    orderRef.current = order
  }, [order])

  const handleScan = useCallback(
    (raw: string) => {
      const value = raw.trim()
      if (!value) return

      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.value === value && now - last.ts < 2000) return
      lastScanRef.current = { value, ts: now }

      startTransition(async () => {
        // Codigo de barras do cartao abre a comanda; qualquer outro codigo e
        // produto, e so faz sentido com uma comanda carregada.
        if (CARD_BARCODE_RE.test(value)) {
          const res = await findOrderByCardBarcode(value)
          if ('needsOpen' in res) {
            setPendingCard({ qr_token: res.qr_token, card_number: res.card_number })
            return
          }
          if ('error' in res) {
            notify('error', res.error)
            return
          }
          setPendingCard(null)
          setOrder(res.order)
          notify('ok', `Comanda #${String(res.order.card_number).padStart(3, '0')} carregada`)
          return
        }

        // Numero curto = numero impresso no cartao. Plano B pra quando o
        // leitor falha ou a camera do aparelho nao le. Codigo de barras tem
        // 8+ digitos, entao nao ha confusao.
        if (/^\d{1,4}$/.test(value)) {
          const res = await findOrderByCardNumber(Number(value))
          if ('needsOpen' in res) {
            setPendingCard({ qr_token: res.qr_token, card_number: res.card_number })
            return
          }
          if ('error' in res) {
            notify('error', res.error)
            return
          }
          setPendingCard(null)
          setOrder(res.order)
          notify('ok', `Comanda #${String(res.order.card_number).padStart(3, '0')} carregada`)
          return
        }

        const current = orderRef.current
        if (!current) {
          notify('error', 'Bipe o cartao ou digite o numero dele antes de lancar itens')
          return
        }

        const res = await addBarcodeToOrder(current.qr_token, value)
        if ('error' in res) {
          notify('error', res.error)
          return
        }
        setOrder(res.order)
        notify('ok', 'Item adicionado')
        void refreshOrders()
      })
    },
    [notify, refreshOrders]
  )

  function addProduct(product: Product) {
    if (!order) {
      notify('error', 'Escaneie uma comanda antes de lancar itens')
      return
    }
    startTransition(async () => {
      const res = await addProductToOrder(order.order_id, product.id, 1)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      await reloadOrder(order.qr_token)
    })
  }

  function changeQty(itemId: string, quantity: number) {
    if (!order) return
    startTransition(async () => {
      const res = await setOrderItemQuantity(order.order_id, itemId, quantity)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      await reloadOrder(order.qr_token)
    })
  }

  function removeItem(itemId: string) {
    if (!order) return
    startTransition(async () => {
      const res = await cancelItemFromOrder(order.order_id, itemId)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      await reloadOrder(order.qr_token)
    })
  }

  function finalize() {
    if (!order) return
    const closing = order
    startTransition(async () => {
      const res = await closeOrder(closing.order_id, [{ method, amount: closing.total }])
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      notify(
        'ok',
        `Comanda #${String(closing.card_number).padStart(3, '0')} fechada — ${brl(closing.total)}`
      )
      // Comprovante nao fiscal na termica. A janela imprime sozinha e fecha;
      // se o navegador bloquear o popup, o caixa segue normal (o botao
      // Reimprimir da o mesmo caminho).
      if (autoPrint) openReceipt(closing.order_id)
      setOrder(null)
      void refreshOrders()
      scanRef.current?.focus()
    })
  }

  function openReceipt(orderId: string) {
    window.open(`/pedidos/${orderId}/imprimir`, '_blank', 'width=420,height=640')
  }

  // Categorias na ordem em que aparecem nos chips, com a tecla impressa.
  const categoryTabs = useMemo(
    () =>
      [{ key: 'all', label: 'Todos' }, ...categories.map((c) => ({ key: c.id, label: c.name }))]
        .slice(0, 9)
        .map((t, i) => ({ ...t, hint: String(i + 1) })),
    [categories]
  )

  // Atalhos: F2 busca, F9 finaliza, Esc limpa a venda atual, 1-9 troca
  // categoria. Os numericos ficam suspensos enquanto o foco esta num campo —
  // o PDV tem busca e leitor, e roubar digito deles quebraria a venda.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'F9') {
        e.preventDefault()
        if (order && !pending) finalize()
        return
      }
      if (e.key === 'Escape') {
        setOrder(null)
        scanRef.current?.focus()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const n = Number(e.key)
      if (!n || n > categoryTabs.length) return
      setCategoryId(categoryTabs[n - 1]!.key)
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryId !== 'all' && p.category_id !== categoryId) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
      )
    })
  }, [products, query, categoryId])

  return (
    <div className="-mx-8 -mt-6 h-[calc(100vh-3rem)] flex flex-col">
      {/* Barra do caixa */}
      <header className="flex items-center gap-4 px-8 h-14 border-b border-border bg-bg-elevated shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight">Caixa</span>
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            aberto
          </span>
        </div>

        {/* Campo do leitor ocupa todo o meio da barra — e o que a operadora
            mais usa e o texto nao pode cortar */}
        <div className="relative flex-1 min-w-0">
          <ScanLine
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            ref={scanRef}
            autoFocus
            placeholder="Bipe o cartao, digite o numero dele ou bipe o produto"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const v = e.currentTarget.value
              e.currentTarget.value = ''
              handleScan(v)
            }}
            className="w-full h-9 pl-9 pr-3 bg-bg border border-border rounded-lg text-[13px] font-mono placeholder:text-muted focus:outline-none focus:border-primary"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <button
          onClick={() => {
            const next = !autoPrint
            setAutoPrint(next)
            localStorage.setItem('txoko_pdv_auto_print', next ? 'on' : 'off')
          }}
          title="Imprimir comprovante ao fechar a comanda"
          className={cn(
            'flex items-center gap-2 h-9 px-3 shrink-0 rounded-lg border text-[12px] transition-colors',
            autoPrint
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border text-muted hover:text-foreground'
          )}
        >
          <Printer size={14} />
          {autoPrint ? 'Imprime ao fechar' : 'Sem impressao'}
        </button>

        <div className="flex items-center gap-2 h-9 px-3 shrink-0 rounded-lg border border-border text-[12px] text-muted">
          <ShoppingCart size={14} />
          Comandas abertas
          <span className="font-mono font-semibold text-foreground">{openOrders.length}</span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Catalogo */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <div className="px-8 pt-5 pb-3 space-y-3 shrink-0">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar produto — nome, SKU ou codigo de barras"
                className="w-full h-10 pl-9 pr-14 bg-bg-elevated border border-border rounded-lg text-[13px] placeholder:text-muted focus:outline-none focus:border-primary"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted font-mono border border-border rounded px-1.5 py-0.5">
                F2
              </kbd>
            </div>

            {/* Linha unica com rolagem horizontal e altura fixa: antes as
                categorias embrulhavam em ate tres linhas e empurravam a grade
                de produtos para baixo conforme a largura da janela. */}
            <TabBar
              variant="chip"
              aria-label="Categoria"
              tabs={categoryTabs}
              active={categoryId}
              onChange={setCategoryId}
            />
          </div>

          <div className="flex-1 overflow-y-auto thin-scroll px-8 pb-6">
            {filtered.length === 0 ? (
              <EmptyState
                title="Nenhum produto encontrado"
                hint={
                  query.trim()
                    ? 'Nenhum item bate com a busca. Limpe o campo ou troque a categoria.'
                    : 'Esta categoria esta vazia. Troque de categoria ou cadastre itens no Cardapio.'
                }
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map((p) => {
                  const semEstoque =
                    p.stock_tracked && (p.stock_quantity ?? 0) <= 0
                  return (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      disabled={pending || semEstoque || !order}
                      className={cn(
                        'text-left p-3 rounded-xl border transition-colors',
                        semEstoque || !order
                          ? 'border-border bg-bg-elevated opacity-50 cursor-not-allowed'
                          : 'border-border bg-bg-elevated hover:border-primary hover:bg-surface-hover'
                      )}
                    >
                      <div className="text-[13px] font-medium text-foreground leading-tight line-clamp-2 min-h-[2.4em]">
                        {p.name}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="font-data text-[14px] text-foreground">
                          {brl(Number(p.price))}
                        </span>
                        {semEstoque && (
                          <span className="text-[10px] uppercase tracking-wide text-destructive">
                            sem estoque
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Venda atual */}
        <aside data-pane="pdv" className="flex w-[380px] shrink-0 flex-col bg-panel-veil">
          {order ? (
            <>
              <div className="px-5 py-4 border-b border-border shrink-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-foreground">
                    Comanda #{String(order.card_number).padStart(3, '0')}
                  </span>
                  <span className="text-[11px] text-muted">{modeLabel(order.service_mode)}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto thin-scroll px-5 py-3">
                {order.items.length === 0 ? (
                  <p className="text-[13px] text-muted py-8 text-center">
                    Comanda sem itens.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0"
                      >
                        {item.weight_grams == null ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <StepBtn
                              onClick={() => changeQty(item.id, item.quantity - 1)}
                              disabled={pending}
                            >
                              <Minus size={12} />
                            </StepBtn>
                            <span className="w-6 text-center font-data text-[13px]">
                              {item.quantity}
                            </span>
                            <StepBtn
                              onClick={() => changeQty(item.id, item.quantity + 1)}
                              disabled={pending}
                            >
                              <Plus size={12} />
                            </StepBtn>
                          </div>
                        ) : (
                          <span className="shrink-0 font-data text-[11px] text-muted w-[70px]">
                            {item.weight_grams} g
                          </span>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-foreground truncate">
                            {item.product_name}
                          </div>
                        </div>

                        <span className="font-data text-[13px] text-foreground shrink-0">
                          {brl(Number(item.total_price))}
                        </span>

                        <button
                          onClick={() => removeItem(item.id)}
                          disabled={pending}
                          className="text-muted hover:text-destructive transition-colors shrink-0"
                          aria-label="Remover item"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="px-5 py-4 border-t border-border shrink-0 space-y-3">
                <div className="space-y-1 text-[12px]">
                  <Line label="Subtotal" value={brl(Number(order.subtotal))} />
                  {Number(order.discount) > 0 && (
                    <Line label="Desconto" value={`− ${brl(Number(order.discount))}`} />
                  )}
                  {Number(order.service_fee) > 0 && (
                    <Line label="Taxa de servico" value={brl(Number(order.service_fee))} />
                  )}
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] uppercase tracking-wide text-muted">Total</span>
                  <span className="font-data text-[26px] font-semibold text-foreground">
                    {brl(Number(order.total))}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setMethod(m.value)}
                      className={cn(
                        'h-9 rounded-lg text-[12px] border transition-colors',
                        method === m.value
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted hover:text-foreground'
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={finalize}
                  disabled={pending || order.items.length === 0}
                  className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
                >
                  {pending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Receber {brl(Number(order.total))}
                      <kbd className="text-[10px] font-mono opacity-70">F9</kbd>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col">
              {pendingCard && (
                <div className="px-5 py-4 border-b border-border bg-warm/10">
                  <p className="text-[13px] font-semibold text-foreground">
                    Cartao #{String(pendingCard.card_number).padStart(3, '0')} sem comanda
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    O cliente nao passou pela balanca. Abrir aqui cria a comanda
                    vazia, sem cobrar modalidade.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={abrirComanda}
                      disabled={pending}
                      className="h-9 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-[13px] flex items-center gap-2 disabled:opacity-40"
                    >
                      {pending ? <Loader2 size={14} className="animate-spin" /> : null}
                      Abrir comanda
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingCard(null)}
                      className="h-9 px-3 rounded-lg border border-border text-[13px] text-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <div className="px-5 py-4 border-b border-border">
                <span className="text-[13px] font-semibold text-foreground">
                  Comandas abertas
                </span>
              </div>
              <div className="flex-1 overflow-y-auto thin-scroll px-3 py-3">
                {openOrders.length === 0 ? (
                  <p className="text-[13px] text-muted py-10 text-center px-4">
                    Nenhuma comanda aberta. Bipe o codigo de barras de um cartao pra comecar.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {openOrders.map((o) => (
                      <li key={o.order_id}>
                        <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-bg">
                          <span className="font-data text-[15px] text-foreground w-12 shrink-0">
                            {o.card_number != null
                              ? `#${String(o.card_number).padStart(3, '0')}`
                              : '—'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-foreground truncate">
                              {modeLabel(o.service_mode)}
                            </div>
                            <div className="text-[11px] text-muted flex items-center gap-1">
                              <Clock size={10} />
                              {sinceLabel(o.opened_at)} · {o.items_count}{' '}
                              {o.items_count === 1 ? 'item' : 'itens'}
                            </div>
                          </div>
                          <span className="font-data text-[13px] text-foreground shrink-0">
                            {brl(o.total)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="px-5 py-3 text-[11px] text-muted border-t border-border">
                Bipe o cartao pra abrir a comanda e editar os itens.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Camera sempre ativa: le o codigo de barras do cartao e o das bebidas,
          sem precisar de leitor USB */}
      <BackgroundCameraScanner onScan={handleScan} />

      {feedback && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-[13px] font-medium shadow-lg z-50',
            feedback.kind === 'ok'
              ? 'bg-success/15 text-success border border-success/30'
              : 'bg-destructive/15 text-destructive border border-destructive/30'
          )}
        >
          {feedback.text}
        </div>
      )}
    </div>
  )
}

function StepBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-6 h-6 rounded-md border border-border text-muted hover:text-foreground disabled:opacity-30 flex items-center justify-center transition-colors"
    >
      {children}
    </button>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{label}</span>
      <span className="font-data text-foreground">{value}</span>
    </div>
  )
}
