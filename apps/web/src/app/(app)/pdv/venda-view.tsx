'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Category, Product } from '@txoko/shared'
import {
  Search,
  ScanLine,
  Plus,
  Minus,
  X,
  Loader2,
  ShoppingCart,
  Clock,
  Printer,
  ArrowLeft,
  Ban,
  RotateCw,
} from 'lucide-react'
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
import { currentUserCanCancel } from '@/app/(app)/pedidos/actions'
import { CancelOrderModal } from '@/components/pedidos/cancel-order-modal'
import { safeAction } from '@/lib/safe-action'
import { cn, formatCurrency } from '@/lib/utils'
import { TabBar } from '@/components/tab-bar'
import { EmptyState } from '@/components/states'

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

function cardLabel(n: number | null): string {
  return n != null ? `#${String(n).padStart(3, '0')}` : '—'
}

function sinceLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`
}

type CancelTarget = { id: string; status: string; total: number }

export function VendaView({
  products,
  categories,
}: {
  products: Product[]
  categories: Category[]
}) {
  const router = useRouter()
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
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null)
  const [canCancel, setCanCancel] = useState(false)
  const [pending, startTransition] = useTransition()

  const searchRef = useRef<HTMLInputElement>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const notify = useCallback((kind: 'ok' | 'error', text: string) => {
    setFeedback({ kind, text })
    setTimeout(() => setFeedback(null), 3000)
  }, [])

  // O leitor digita no que estiver focado — depois de qualquer acao o foco
  // volta pro campo dele, senao a proxima bipada cai no vazio.
  const focusScan = useCallback(() => {
    scanRef.current?.focus()
  }, [])

  // Falha de rede/deploy no refresh nao pode zerar a lista: mantem a
  // anterior e segue — a proxima interacao tenta de novo.
  const refreshOrders = useCallback(async () => {
    const res = await safeAction(listOpenOrders())
    if (Array.isArray(res)) setOpenOrders(res)
  }, [])

  useEffect(() => {
    void refreshOrders()
    setAutoPrint(localStorage.getItem('txoko_pdv_auto_print') !== 'off')
    void currentUserCanCancel()
      .then(setCanCancel)
      .catch(() => setCanCancel(false))
  }, [refreshOrders])

  // Recarrega a comanda atual depois de cada alteracao
  const reloadOrder = useCallback(
    async (token: string) => {
      const res = await safeAction(findOrderByCardToken(token))
      if ('ok' in res) setOrder(res.order)
      else if ('error' in res) notify('error', res.error)
      void refreshOrders()
      focusScan()
    },
    [refreshOrders, focusScan, notify]
  )

  // Abre a comanda do cartao aqui no caixa, sem mandar o cliente ate a
  // balanca so pra registrar uma bebida.
  const abrirComanda = useCallback(() => {
    const alvo = pendingCard
    if (!alvo) return
    startTransition(async () => {
      const res = await safeAction(openOrderFromCard(alvo.qr_token))
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      setPendingCard(null)
      setOrder(res.order)
      notify('ok', `Comanda ${cardLabel(res.order.card_number)} aberta`)
      void refreshOrders()
      focusScan()
    })
  }, [pendingCard, notify, refreshOrders, focusScan])

  // A camera dispara varias vezes por segundo — ignora repeticao em <2s
  const lastScanRef = useRef<{ value: string; ts: number } | null>(null)

  // handleScan e memoizado e a camera segura a referencia antiga; o ref
  // garante que ele enxergue sempre a comanda atual.
  const orderRef = useRef<CaixaOrder | null>(null)
  useEffect(() => {
    orderRef.current = order
  }, [order])

  // Com o modal de cancelamento aberto, o teclado e dele.
  const modalOpenRef = useRef(false)
  useEffect(() => {
    modalOpenRef.current = cancelTarget !== null
  }, [cancelTarget])

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
          const res = await safeAction(findOrderByCardBarcode(value))
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
          notify('ok', `Comanda ${cardLabel(res.order.card_number)} carregada`)
          return
        }

        // Numero curto = numero impresso no cartao. Plano B pra quando o
        // leitor falha ou a camera do aparelho nao le. Codigo de barras tem
        // 8+ digitos, entao nao ha confusao.
        if (/^\d{1,4}$/.test(value)) {
          const res = await safeAction(findOrderByCardNumber(Number(value)))
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
          notify('ok', `Comanda ${cardLabel(res.order.card_number)} carregada`)
          return
        }

        const current = orderRef.current
        if (!current) {
          notify('error', 'Bipe o cartao ou digite o numero dele antes de lancar itens')
          return
        }

        const res = await safeAction(addBarcodeToOrder(current.qr_token, value))
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
      const res = await safeAction(addProductToOrder(order.order_id, product.id, 1))
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
      const res = await safeAction(setOrderItemQuantity(order.order_id, itemId, quantity))
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
      const res = await safeAction(cancelItemFromOrder(order.qr_token, itemId))
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
      const res = await safeAction(closeOrder(closing.order_id, [{ method, amount: closing.total }]))
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      notify(
        'ok',
        `Comanda ${cardLabel(closing.card_number)} fechada — ${brl(closing.total)}`
      )
      // Comprovante nao fiscal na termica. A janela imprime sozinha e fecha;
      // se o navegador bloquear o popup, o caixa segue normal (o botao
      // Reimprimir da o mesmo caminho).
      if (autoPrint) openReceipt(closing.order_id)
      setOrder(null)
      void refreshOrders()
      focusScan()
    })
  }

  function openReceipt(orderId: string) {
    window.open(`/pedidos/${orderId}/imprimir`, '_blank', 'width=420,height=640')
  }

  // Volta pra lista de comandas sem fechar nada.
  const backToList = useCallback(() => {
    setOrder(null)
    setPendingCard(null)
    void refreshOrders()
    focusScan()
  }, [refreshOrders, focusScan])

  // Carrega a comanda clicada na lista. Pelo TOKEN do cartao do proprio
  // pedido, nao pelo numero: numero pode se repetir entre cartao ativo e
  // regerado, e ai o clique abriria a comanda errada (ou nenhuma).
  function loadFromList(o: OpenOrderSummary) {
    if (o.qr_token == null) {
      // Pedido aberto sem cartao (mesa, delivery): o lugar dele e Pedidos.
      router.push('/pedidos')
      return
    }
    const token = o.qr_token
    startTransition(async () => {
      const res = await safeAction(findOrderByCardToken(token))
      if ('needsOpen' in res) {
        setPendingCard({ qr_token: res.qr_token, card_number: res.card_number })
        return
      }
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      setOrder(res.order)
      focusScan()
    })
  }

  function toggleAutoPrint() {
    const next = !autoPrint
    setAutoPrint(next)
    localStorage.setItem('txoko_pdv_auto_print', next ? 'on' : 'off')
    notify('ok', next ? 'Comprovante sera impresso ao fechar' : 'Fechamento sem impressao')
    focusScan()
  }

  const categoryTabs = useMemo(
    () =>
      [{ key: 'all', label: 'Todos' }, ...categories.map((c) => ({ key: c.id, label: c.name }))],
    [categories]
  )

  // Atalhos: F2 busca, F5-F8 forma de pagamento, F9 finaliza, Esc volta pra
  // lista. Digito solto NAO troca mais categoria: qualquer tecla imprimivel
  // fora de um campo e redirecionada pro campo do leitor (efeito abaixo) —
  // o numero da comanda tem prioridade sobre atalho.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modalOpenRef.current) return
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
      const pm = PAYMENT_METHODS.find((m) => m.key === e.key)
      if (pm) {
        e.preventDefault()
        setMethod(pm.value)
        return
      }
      if (e.key === 'Escape') {
        backToList()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // A dor real do balcao: o leitor dispara com o foco perdido em qualquer
  // canto e a leitura evapora. Qualquer tecla imprimivel que nao esteja indo
  // pra um campo cai no campo do leitor — sem precisar clicar nele.
  useEffect(() => {
    function redirect(e: KeyboardEvent) {
      if (modalOpenRef.current) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length !== 1 || e.key === ' ') return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (t?.isContentEditable) return
      // Focar durante o keydown faz o caractere cair ja no campo.
      scanRef.current?.focus()
    }
    window.addEventListener('keydown', redirect, true)
    return () => window.removeEventListener('keydown', redirect, true)
  }, [])

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
    <div className="-mx-8 -my-6 flex min-h-0 flex-1 flex-col">
      {/* Barra do caixa — shrink-0: rolagem e por painel, o topo nao sai */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-rule-faint bg-island px-8">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight">Caixa</span>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" />
            aberto
          </span>
        </div>

        {/* Campo do leitor ocupa todo o meio da barra — e o que a operadora
            mais usa e o texto nao pode cortar */}
        <div className="relative min-w-0 flex-1">
          <ScanLine
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            ref={scanRef}
            autoFocus
            aria-label="Leitor de cartao e produto"
            placeholder="Bipe o cartao, digite o numero dele ou bipe o produto"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const v = e.currentTarget.value
              e.currentTarget.value = ''
              handleScan(v)
            }}
            className="font-data h-9 w-full rounded-lg border border-rule bg-field pl-9 pr-3 text-[13px] placeholder:text-ink-muted focus:border-teal focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <button
          onClick={toggleAutoPrint}
          aria-pressed={autoPrint}
          title="Imprimir comprovante ao fechar a comanda"
          className={cn(
            'flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-[12px] font-medium transition-colors',
            autoPrint
              ? 'border-teal bg-teal-soft text-teal-deep'
              : 'border-rule text-ink-muted hover:bg-sunken hover:text-ink'
          )}
        >
          <Printer size={14} />
          {autoPrint ? 'Imprime ao fechar' : 'Sem impressao'}
        </button>

        {/* Nao e so contador: clicar volta pra lista de comandas. */}
        <button
          onClick={backToList}
          aria-pressed={!order && !pendingCard}
          title="Ver as comandas abertas"
          className={cn(
            'flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-[12px] font-medium transition-colors',
            !order && !pendingCard
              ? 'border-teal bg-teal-soft text-teal-deep'
              : 'border-rule text-ink-muted hover:bg-sunken hover:text-ink'
          )}
        >
          <ShoppingCart size={14} />
          Comandas
          <span className="font-data text-[12px] font-bold">{openOrders.length}</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Catalogo */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-rule-faint">
          <div className="shrink-0 space-y-3 px-8 pb-3 pt-5">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar produto — nome, SKU ou codigo de barras"
                className="h-10 w-full rounded-lg border border-rule bg-island pl-9 pr-14 text-[13px] placeholder:text-ink-muted focus:border-teal focus:outline-none"
              />
              <kbd className="font-data absolute right-3 top-1/2 -translate-y-1/2 rounded border border-rule px-1.5 py-0.5 text-[10px] text-ink-muted">
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

          <div className="thin-scroll flex-1 overflow-y-auto px-8 pb-6">
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => {
                  const semEstoque =
                    p.stock_tracked && (p.stock_quantity ?? 0) <= 0
                  return (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      disabled={pending || semEstoque || !order}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-colors',
                        semEstoque || !order
                          ? 'cursor-not-allowed border-rule-faint bg-island opacity-50'
                          : 'border-rule-faint bg-island hover:border-teal hover:bg-sunken'
                      )}
                    >
                      <div className="line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-tight text-ink">
                        {p.name}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="font-data text-[14px] text-ink">
                          {brl(Number(p.price))}
                        </span>
                        {semEstoque && (
                          <span className="text-[10px] uppercase tracking-wide text-red">
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
              <div className="shrink-0 border-b border-rule-faint px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={backToList}
                    aria-label="Voltar as comandas abertas"
                    title="Voltar as comandas abertas (Esc)"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className="font-data text-[14px] font-semibold text-ink">
                      {cardLabel(order.card_number)}
                    </span>
                    <span className="ml-2 text-[11px] text-ink-muted">
                      {modeLabel(order.service_mode)}
                    </span>
                  </div>
                  <button
                    onClick={() => openReceipt(order.order_id)}
                    aria-label="Imprimir conferencia"
                    title="Imprimir conferencia (sem fechar)"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
                  >
                    <Printer size={14} />
                  </button>
                  <button
                    onClick={() =>
                      setCancelTarget({
                        id: order.order_id,
                        status: order.status,
                        total: order.total,
                      })
                    }
                    aria-label="Cancelar comanda"
                    title="Cancelar a comanda inteira"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-red-tint hover:text-red"
                  >
                    <Ban size={14} />
                  </button>
                </div>
              </div>

              <div className="thin-scroll flex-1 overflow-y-auto px-5 py-3">
                {order.items.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-ink-muted">
                    Comanda sem itens.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 border-b border-rule-faint py-2 last:border-0"
                      >
                        {item.weight_grams == null ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <StepBtn
                              onClick={() => changeQty(item.id, item.quantity - 1)}
                              disabled={pending}
                              label="Diminuir quantidade"
                            >
                              <Minus size={12} />
                            </StepBtn>
                            <span className="font-data w-6 text-center text-[13px]">
                              {item.quantity}
                            </span>
                            <StepBtn
                              onClick={() => changeQty(item.id, item.quantity + 1)}
                              disabled={pending}
                              label="Aumentar quantidade"
                            >
                              <Plus size={12} />
                            </StepBtn>
                          </div>
                        ) : (
                          <span className="font-data w-[70px] shrink-0 text-[11px] text-ink-muted">
                            {item.weight_grams} g
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-ink">
                            {item.product_name}
                          </div>
                        </div>

                        <span className="font-data shrink-0 text-[13px] text-ink">
                          {brl(Number(item.total_price))}
                        </span>

                        <button
                          onClick={() => removeItem(item.id)}
                          disabled={pending}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-red-tint hover:text-red"
                          aria-label="Remover item"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="shrink-0 space-y-3 border-t border-rule-faint px-5 py-4">
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
                  <span className="text-[12px] uppercase tracking-wide text-ink-muted">Total</span>
                  <span className="font-data text-[26px] font-semibold text-ink">
                    {brl(Number(order.total))}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setMethod(m.value)}
                      aria-pressed={method === m.value}
                      className={cn(
                        'flex h-10 flex-col items-center justify-center rounded-lg border text-[12px] leading-tight transition-colors',
                        method === m.value
                          ? 'border-teal bg-teal-soft font-semibold text-teal-deep'
                          : 'border-rule text-ink-muted hover:bg-sunken hover:text-ink'
                      )}
                    >
                      {m.label}
                      <kbd className="font-data text-[9px] opacity-60">{m.key}</kbd>
                    </button>
                  ))}
                </div>

                <button
                  onClick={finalize}
                  disabled={pending || order.items.length === 0}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal text-[14px] font-semibold text-on-teal transition-opacity disabled:opacity-40"
                >
                  {pending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Receber {brl(Number(order.total))}
                      <kbd className="font-data text-[10px] opacity-70">F9</kbd>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {pendingCard && (
                <div className="shrink-0 border-b border-rule-faint bg-red-tint/40 px-5 py-4">
                  <p className="text-[13px] font-semibold text-ink">
                    Cartao {cardLabel(pendingCard.card_number)} sem comanda
                  </p>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    O cliente nao passou pela balanca. Abrir aqui cria a comanda
                    vazia, sem cobrar modalidade.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={abrirComanda}
                      disabled={pending}
                      className="flex h-9 items-center gap-2 rounded-lg bg-teal px-4 text-[13px] font-semibold text-on-teal disabled:opacity-40"
                    >
                      {pending ? <Loader2 size={14} className="animate-spin" /> : null}
                      Abrir comanda
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingCard(null)}
                      className="h-9 rounded-lg border border-rule px-3 text-[13px] text-ink-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <div className="flex shrink-0 items-center justify-between border-b border-rule-faint px-5 py-4">
                <span className="text-[13px] font-semibold text-ink">
                  Comandas abertas
                </span>
                <button
                  onClick={() => void refreshOrders()}
                  aria-label="Atualizar lista"
                  title="Atualizar lista"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
                >
                  <RotateCw size={13} />
                </button>
              </div>
              <div className="thin-scroll flex-1 overflow-y-auto px-3 py-3">
                {openOrders.length === 0 ? (
                  <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
                    Nenhuma comanda aberta. Bipe o codigo de barras de um cartao pra comecar.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {openOrders.map((o) => (
                      <li key={o.order_id} className="group relative">
                        {/* A linha inteira carrega a comanda: dali edita,
                            lanca produto e fecha. Impressao e cancelamento
                            ficam nos icones da direita. */}
                        <button
                          onClick={() => loadFromList(o)}
                          disabled={pending}
                          title={
                            o.qr_token != null
                              ? `Abrir a comanda ${cardLabel(o.card_number)} — editar, lancar itens ou fechar`
                              : 'Pedido sem cartao — gerenciar na tela de Pedidos'
                          }
                          className="flex min-h-[56px] w-full items-center gap-3 rounded-[12px] border border-rule bg-panel px-3.5 py-2.5 pr-[84px] text-left transition-colors hover:border-teal hover:bg-teal-tint disabled:opacity-60"
                        >
                          <span className="font-data w-12 shrink-0 text-[15px] text-ink">
                            {cardLabel(o.card_number)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] text-ink">
                              {modeLabel(o.service_mode)}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-ink-muted">
                              <Clock size={10} />
                              {sinceLabel(o.opened_at)} · {o.items_count}{' '}
                              {o.items_count === 1 ? 'item' : 'itens'}
                            </div>
                          </div>
                          <span className="font-data shrink-0 text-[13px] text-ink">
                            {brl(o.total)}
                          </span>
                        </button>
                        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                          <button
                            onClick={() => openReceipt(o.order_id)}
                            aria-label={`Imprimir conferencia da comanda ${cardLabel(o.card_number)}`}
                            title="Imprimir conferencia"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            onClick={() =>
                              setCancelTarget({
                                id: o.order_id,
                                status: o.status,
                                total: o.total,
                              })
                            }
                            aria-label={`Cancelar comanda ${cardLabel(o.card_number)}`}
                            title="Cancelar comanda"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-red-tint hover:text-red"
                          >
                            <Ban size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="shrink-0 border-t border-rule-faint px-5 py-3 text-[11px] text-ink-muted">
                Bipe o cartao ou toque numa comanda pra abrir e editar.
              </p>
            </div>
          )}
        </aside>
      </div>

      {feedback && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2.5 text-[13px] font-medium shadow-e3',
            feedback.kind === 'ok'
              ? 'border-teal bg-teal-soft text-teal-deep'
              : 'border-red bg-red-tint text-red'
          )}
        >
          {feedback.text}
        </div>
      )}

      {/* Mesmo fluxo de cancelamento da tela de Pedidos: motivo obrigatorio,
          decisao de estorno e trilha de quem autorizou. */}
      {cancelTarget && (
        <CancelOrderModal
          orderId={cancelTarget.id}
          orderStatus={cancelTarget.status}
          orderTotal={cancelTarget.total}
          sourceLabel="PDV"
          canCancel={canCancel}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            if (order?.order_id === cancelTarget.id) setOrder(null)
            setCancelTarget(null)
            notify('ok', 'Comanda cancelada')
            void refreshOrders()
            focusScan()
          }}
        />
      )}
    </div>
  )
}

function StepBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-rule text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-ink-muted">
      <span>{label}</span>
      <span className="font-data text-ink">{value}</span>
    </div>
  )
}
