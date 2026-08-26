'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseScan } from '@/lib/parse-scan'
import {
  resolveBarcode,
  addWeightItem,
  addBarcodeItem,
  cancelItem,
  setServiceMode,
  getRates,
  type StationSnapshot,
  type StationItem,
  type ServiceMode,
  type StationRates,
} from '@/lib/supabase'
import {
  formatCurrency,
  formatWeight,
  formatWeightProse,
  parseManualWeight,
  serviceModeLabel,
} from '@/lib/format'

/**
 * Frente da estacao.
 *
 * Zero icones, de proposito. Numa tela que ja mostra peso e preco em corpo
 * grande, o glifo nao informa nada — a distincao entre um prato pesado e uma
 * bebida sai da tipografia, da regua colorida e do fio que separa as linhas.
 *
 * A lista de itens e uma comanda, nao um cartao por item: mono alinhada a
 * direita, nome, taxa, preco, linhas separadas por fio de 1px. Raios de 4px,
 * densidade de terminal.
 *
 * A leitura automatica da balanca (Web Serial, Toledo Prix IV) ainda nao
 * existe — falta o cabo. Ate la o peso entra a mao, que no desenho e via de
 * excecao de primeira classe e nao gambiarra: o campo mora no trilho da
 * comanda ativa, entao pratos 2..n tem caminho sem sair da tela.
 */

type Toast = { id: number; kind: 'ok' | 'error'; text: string }

// Teclas do teclado numerico -> modalidade, na ordem em que aparecem na tela.
// A tecla nao e anunciada ali (o desenho nao mostra atalho nessa tela), mas
// serve de acelerador pra quem opera o dia inteiro.
const MODE_BY_KEY: Record<string, ServiceMode> = {
  '1': 'por_kg',
  '2': 'avontade',
}

// Acima disso pede confirmacao. Prato de self-service raramente passa de
// 1,5 kg. O desenho preve isto configuravel por restaurante (max 3.000 g);
// enquanto nao ha onde guardar, fica aqui.
const WEIGHT_CONFIRM_THRESHOLD = 1500

// Barras de largura variada — o cartao e lido por codigo de barras, nao QR.
const BARCODE_WIDTHS = [
  3, 7, 2, 4, 9, 3, 2, 6, 4, 3, 8, 2, 5, 3, 7, 2, 9, 4, 3, 6, 2, 8, 3, 4, 2, 7,
]

function isPorKg(mode: ServiceMode | null): boolean {
  return mode === 'por_kg' || mode === 'por_kg_2mix'
}

function itemCountLabel(n: number): string {
  if (n === 0) return 'nenhum item'
  return n === 1 ? '1 item' : `${n} itens`
}

export default function StationPage() {
  const [session, setSession] = useState<StationSnapshot | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [cancelToken, setCancelToken] = useState<string | null>(null)
  const [buffer, setBuffer] = useState('')
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  // Peso alto aguardando confirmacao (null = nada pendente)
  const [pendingWeight, setPendingWeight] = useState<number | null>(null)
  // Reabre o seletor quando a atendente aperta a modalidade errada
  const [changingMode, setChangingMode] = useState(false)
  const [rates, setRates] = useState<StationRates | null>(null)
  const [clock, setClock] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const lastScanRef = useRef<{ value: string; ts: number } | null>(null)
  const cancelInFlightRef = useRef<boolean>(false)

  // Relogio do rodape da tela de espera. So depois da hidratacao, senao o
  // servidor renderiza um horario e o cliente outro.
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      )
    tick()
    const t = setInterval(tick, 20000)
    return () => clearInterval(t)
  }, [])

  // Auto-focus no input sempre que clicar em qualquer lugar
  useEffect(() => {
    const refocus = () => inputRef.current?.focus()
    refocus()
    window.addEventListener('click', refocus)
    window.addEventListener('touchend', refocus)
    return () => {
      window.removeEventListener('click', refocus)
      window.removeEventListener('touchend', refocus)
    }
  }, [])

  // Auto-encerra apos 5 minutos de inatividade (comanda segue aberta no DB)
  useEffect(() => {
    if (!session) return
    const t = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 5 * 60 * 1000) {
        finishSession()
      }
    }, 10000)
    return () => clearInterval(t)
  }, [session])

  const pushToast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, kind, text }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  function finishSession() {
    setSession(null)
    setToken(null)
    setCancelToken(null)
    setBuffer('')
    setPendingWeight(null)
    setChangingMode(false)
    setRates(null)
  }

  // As tarifas do restaurante, buscadas assim que a comanda abre. Sem elas a
  // tela de escolha vira uma pergunta sem numero.
  useEffect(() => {
    if (!token) return
    let alive = true
    void getRates(token)
      .then((r) => {
        if (alive) setRates(r)
      })
      .catch(() => {
        // A escolha continua possivel sem preco na tela; o lancamento e quem
        // recusa uma modalidade sem produto cadastrado.
        if (alive) setRates(null)
      })
    return () => {
      alive = false
    }
  }, [token])

  // Define a modalidade da comanda. Uma comanda por pessoa, entao o "a
  // vontade" e sempre 1 — nao ha quantidade pra ajustar na estacao.
  const applyMode = useCallback(
    async (mode: ServiceMode) => {
      if (!token) return
      try {
        setBusy(true)
        const snap = await setServiceMode(token, mode, 1)
        setSession(snap)
        setChangingMode(false)
        pushToast('ok', serviceModeLabel(mode))
      } catch (e) {
        pushToast('error', e instanceof Error ? e.message : 'Erro ao definir modalidade')
      } finally {
        setBusy(false)
      }
    },
    [token, pushToast]
  )

  const applyManualWeight = useCallback(
    async (grams: number) => {
      if (!token) return
      try {
        setBusy(true)
        const snap = await addWeightItem(token, grams)
        setSession(snap)
        pushToast('ok', `+ ${formatWeight(grams)}`)
      } catch (e) {
        pushToast('error', e instanceof Error ? e.message : 'Erro ao lancar peso')
      } finally {
        setBusy(false)
      }
    },
    [token, pushToast]
  )

  const handleScan = useCallback(
    async (raw: string) => {
      // Dedup: evita scan duplicado em <2s (camera dispara muitas vezes por segundo)
      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.value === raw && now - last.ts < 2000) return
      lastScanRef.current = { value: raw, ts: now }

      const scan = parseScan(raw)
      lastActivityRef.current = now

      if (scan.kind === 'unknown') {
        pushToast('error', `Codigo nao reconhecido: ${scan.raw.slice(0, 20)}`)
        return
      }

      // Sem comanda aberta: so cartao de cliente entra.
      if (!session) {
        if (scan.kind !== 'card_barcode') {
          pushToast('error', 'Bipe o codigo de barras do cartao primeiro')
          return
        }
        try {
          setBusy(true)
          const res = await resolveBarcode(scan.barcode)
          if (res.kind === 'cancel') {
            pushToast('error', 'Abra uma comanda antes de usar o cartao de cancelamento')
            return
          }
          setSession(res.session)
          setToken(res.qr_token)
          pushToast('ok', `Comanda ${res.session.comanda_card.card_number} aberta`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro ao abrir comanda'
          pushToast('error', msg)
        } finally {
          setBusy(false)
        }
        return
      }

      if (!token) return

      if (scan.kind === 'card_barcode') {
        try {
          setBusy(true)
          const res = await resolveBarcode(scan.barcode)
          if (res.kind === 'cancel') {
            setCancelToken(res.qr_token)
            pushToast('ok', 'Modo cancelamento — toque no item pra cancelar')
          } else {
            pushToast('error', 'Ja existe uma comanda aberta — finalize antes')
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro'
          pushToast('error', msg)
        } finally {
          setBusy(false)
        }
        return
      }

      try {
        setBusy(true)
        let snap: StationSnapshot
        if (scan.kind === 'weight') {
          snap = await addWeightItem(token, scan.weightGrams)
          pushToast('ok', `+ ${formatWeight(scan.weightGrams)}`)
        } else {
          snap = await addBarcodeItem(token, scan.code)
          pushToast('ok', 'Item adicionado')
        }
        setSession(snap)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao adicionar item'
        pushToast('error', msg)
      } finally {
        setBusy(false)
      }
    },
    [session, token, pushToast]
  )

  // O leitor HID "digita" no input + Enter ao final. Um input so atende tudo:
  // leitor, modalidade, e peso digitado. Nao ha colisao — o leitor manda 8+
  // digitos e a digitacao manual e sempre curta.
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && pendingWeight != null) {
      e.preventDefault()
      setPendingWeight(null)
      return
    }

    if (e.key !== 'Enter') return
    e.preventDefault()

    const v = e.currentTarget.value.trim()
    e.currentTarget.value = ''
    setBuffer('')

    // 1) Confirmacao de peso alto pendente — Enter confirma
    if (pendingWeight != null) {
      const grams = pendingWeight
      setPendingWeight(null)
      void applyManualWeight(grams)
      return
    }

    if (!v) return

    // 2) Comanda aberta sem modalidade: 1 / 2 / 3
    if (session && (!session.service_mode || changingMode)) {
      const mode = MODE_BY_KEY[v]
      if (mode) {
        void applyMode(mode)
      } else {
        pushToast('error', 'Toque em Por quilo ou À vontade')
      }
      return
    }

    // 3) "Por quilo": peso digitado (gramas ou quilos)
    if (session && isPorKg(session.service_mode)) {
      const grams = parseManualWeight(v)
      if (grams != null) {
        if (grams <= 0) {
          pushToast('error', 'Peso invalido')
          return
        }
        if (grams > WEIGHT_CONFIRM_THRESHOLD) {
          setPendingWeight(grams)
          return
        }
        void applyManualWeight(grams)
        return
      }
    }

    // 4) Resto e scan
    handleScan(v)
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-bg text-ink">
      {!session ? (
        <>
          <IdleView clock={clock} busy={busy} />
          <input
            ref={inputRef}
            autoFocus
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            onKeyDown={onInputKeyDown}
            className="absolute h-0 w-0 opacity-0"
            aria-label="Leitor de codigo de barras"
          />
        </>
      ) : (
        <ActiveView
          session={session}
          rates={rates}
          busy={busy}
          onFinish={finishSession}
          inputRef={inputRef}
          buffer={buffer}
          setBuffer={setBuffer}
          onInputKeyDown={onInputKeyDown}
          onPickMode={(m) => void applyMode(m)}
          changingMode={changingMode}
          onStartChangeMode={() => setChangingMode(true)}
          cancelToken={cancelToken}
          onCloseCancelMode={() => setCancelToken(null)}
          onCancelItem={async (itemId) => {
            if (!cancelToken) return
            if (cancelInFlightRef.current) return
            cancelInFlightRef.current = true
            try {
              setBusy(true)
              const snap = await cancelItem(cancelToken, session.order_id, itemId)
              setSession(snap)
              pushToast('ok', 'Item cancelado')
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Erro ao cancelar'
              pushToast('error', msg)
            } finally {
              setBusy(false)
              setTimeout(() => {
                cancelInFlightRef.current = false
              }, 300)
            }
          }}
        />
      )}

      {pendingWeight != null && (
        <WeightGuard
          grams={pendingWeight}
          threshold={WEIGHT_CONFIRM_THRESHOLD}
          onCorrigir={() => setPendingWeight(null)}
          onAceitar={() => {
            const grams = pendingWeight
            setPendingWeight(null)
            void applyManualWeight(grams)
          }}
        />
      )}

      <Toasts toasts={toasts} inset={!!session} />
    </main>
  )
}

/* ---------------------------------------------------------------- */

function IdleView({ clock, busy }: { clock: string; busy: boolean }) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-11 px-16">
        <div className="flex h-[132px] items-end gap-[5px]" aria-hidden>
          {BARCODE_WIDTHS.map((w, i) => (
            <span
              key={i}
              className="h-full rounded-[2px] bg-teal"
              style={{
                width: `${w}px`,
                opacity: i % 3 === 0 ? 0.9 : i % 3 === 1 ? 0.55 : 0.75,
                animation: 'est-breathe 2.4s ease-in-out infinite',
                animationDelay: `${i * 60}ms`,
              }}
            />
          ))}
        </div>
        <div className="text-center">
          <h1 className="m-0 text-[62px] font-semibold leading-[1.02] tracking-[-0.03em]">
            Bipe seu cartão
          </h1>
          <p className="mt-3.5 text-2xl leading-[1.4] text-ink-soft">
            Passe o código de barras no leitor para abrir a comanda
          </p>
        </div>
      </div>
      <div className="flex h-[76px] shrink-0 items-center gap-4 border-t border-rule px-10">
        <span
          className="h-[9px] w-[9px] shrink-0 rounded-full bg-teal"
          style={{ animation: 'est-breathe 2s ease-in-out infinite' }}
        />
        <span className="text-[15px] text-ink-muted">
          {busy ? 'Abrindo comanda…' : 'Leitor pronto'}
        </span>
        <div className="flex-1" />
        <span className="text-[15px] text-ink-muted">Txoko · Estação</span>
        <span className="font-mono text-[15px] text-ink-soft">{clock}</span>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- */

function ActiveView({
  session,
  rates,
  busy,
  onFinish,
  inputRef,
  buffer,
  setBuffer,
  onInputKeyDown,
  onPickMode,
  changingMode,
  onStartChangeMode,
  cancelToken,
  onCloseCancelMode,
  onCancelItem,
}: {
  session: StationSnapshot
  rates: StationRates | null
  busy: boolean
  onFinish: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  buffer: string
  setBuffer: (v: string) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onPickMode: (mode: ServiceMode) => void
  changingMode: boolean
  onStartChangeMode: () => void
  cancelToken: string | null
  onCloseCancelMode: () => void
  onCancelItem: (itemId: string) => void
}) {
  const mode = session.service_mode
  const scrollRef = useRef<HTMLDivElement>(null)
  const pickingMode = mode == null || changingMode

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [session.items.length])

  const comandaLabel = String(session.comanda_card.card_number).padStart(3, '0')

  if (pickingMode) {
    return (
      <ModePicker
        comandaLabel={comandaLabel}
        rates={rates}
        busy={busy}
        trocando={changingMode}
        onPick={onPickMode}
        inputRef={inputRef}
        buffer={buffer}
        setBuffer={setBuffer}
        onInputKeyDown={onInputKeyDown}
      />
    )
  }

  const porKg = isPorKg(mode)

  // A taxa vigente ao lado da modalidade: e ela que precifica tudo que entra
  // depois, entao vem antes do numero da comanda.
  const rate = mode ? rates?.[mode] : null
  const activeRate = porKg
    ? rate?.price_per_kg != null
      ? `${formatCurrency(rate.price_per_kg)}/kg`
      : null
    : rate?.price != null
      ? `${formatCurrency(rate.price)} por pessoa`
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabeçalho: a modalidade e a taxa vêm antes do número da comanda,
          porque é o que muda o preço de tudo que entra depois. */}
      <div className="flex h-[92px] shrink-0 items-center gap-5 border-b border-rule px-11">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span
              className={
                'text-xs font-bold uppercase tracking-[0.12em] ' +
                (porKg ? 'text-amber' : 'text-teal')
              }
            >
              {serviceModeLabel(mode)}
            </span>
            {activeRate && (
              <span className="font-mono text-[13px] text-ink-muted">
                {activeRate}
              </span>
            )}
          </div>
          <p className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">
            Comanda <span className="font-mono font-bold">#{comandaLabel}</span>
          </p>
        </div>
        <div className="flex-1" />
        <button
          onClick={onStartChangeMode}
          disabled={busy}
          className="min-h-12 rounded-[4px] border border-rule-strong px-5 text-[15px] font-semibold text-ink-soft disabled:opacity-40"
        >
          Trocar modalidade
        </button>
        <button
          onClick={onFinish}
          className="min-h-12 rounded-[4px] bg-teal px-6 text-base font-bold text-on-accent"
        >
          Finalizar
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Coluna dos itens — comanda, não cartões */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-baseline gap-3 px-11 pb-2.5 pt-6">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
              Itens da comanda
            </p>
            <span className="font-mono text-[13px] text-ink-muted">
              {itemCountLabel(session.items.length)}
            </span>
          </div>
          <div
            ref={scrollRef}
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-11 pb-6"
          >
            {session.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3.5 text-center">
                <p className="text-[21px] font-medium text-ink-soft">
                  Nenhum item ainda
                </p>
                <p className="max-w-[380px] text-[17px] text-ink-muted">
                  {porKg
                    ? 'Digite o peso do prato ou passe a bebida no leitor.'
                    : 'Passe a bebida no leitor.'}
                </p>
              </div>
            ) : (
              session.items.map((item, i) => (
                <ComandaRow
                  key={item.id}
                  item={item}
                  isLast={i === session.items.length - 1}
                />
              ))
            )}
          </div>
        </section>

        {/* Trilho: o peso (ou o preço por pessoa) e o total */}
        <aside className="flex w-[420px] shrink-0 flex-col border-l border-rule px-9 pb-8 pt-6">
          {porKg ? (
            <WeightRail
              inputRef={inputRef}
              buffer={buffer}
              setBuffer={setBuffer}
              onInputKeyDown={onInputKeyDown}
            />
          ) : (
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-teal">
                Preço por pessoa
              </span>
              <p className="mt-3 font-mono text-[52px] font-bold leading-none tracking-[-0.035em]">
                {formatCurrency(session.subtotal)}
              </p>
              <p className="mt-3 text-[15px] leading-[1.45] text-ink-muted">
                Já lançado na comanda. Bebidas entram pelo leitor.
              </p>
              <input
                ref={inputRef}
                autoFocus
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
                onKeyDown={onInputKeyDown}
                className="absolute h-0 w-0 opacity-0"
                aria-label="Leitor de código de barras"
              />
            </div>
          )}

          <div className="flex-1" />

          <p className="mb-[22px] border-t border-rule pt-5 text-sm leading-[1.4] text-ink-soft">
            {porKg
              ? 'Passe a bebida no leitor · o peso do prato entra à mão'
              : 'Passe as bebidas no leitor'}
          </p>

          {/* Total em bloco próprio: é o número que o cliente lê do outro
              lado do balcão. */}
          <div className="rounded-[4px] bg-teal-soft px-6 pb-6 pt-[22px]">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Total
            </span>
            <p className="mt-2.5 font-mono text-[62px] font-bold leading-none tracking-[-0.045em] text-ink">
              {formatCurrency(session.total)}
            </p>
          </div>
        </aside>
      </div>

      {cancelToken && (
        <CancelSheet
          items={session.items}
          busy={busy}
          onCancelItem={onCancelItem}
          onClose={onCloseCancelMode}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- */

function ComandaRow({ item, isLast }: { item: StationItem; isLast: boolean }) {
  const isWeight = item.weight_grams != null
  return (
    <div
      className="grid grid-cols-[112px_minmax(0,1fr)_auto] items-baseline gap-[22px] border-b border-rule-faint py-[17px]"
      style={isLast ? { animation: 'est-land .22s ease-out' } : undefined}
    >
      <span
        className={
          'text-right font-mono text-lg font-bold ' +
          (isWeight ? 'text-amber' : 'text-ink-soft')
        }
      >
        {isWeight ? formatWeight(item.weight_grams) : `${item.quantity} un`}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2.5">
          <span className="truncate text-[19px] font-medium">
            {item.product_name}
          </span>
          {isLast && (
            <span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.09em] text-teal">
              lançado
            </span>
          )}
        </span>
        <span className="mt-[3px] block font-mono text-[13.5px] text-ink-muted">
          {isWeight
            ? `${formatCurrency(item.unit_price)}/kg`
            : `${formatCurrency(item.unit_price)} cada`}
        </span>
      </span>
      <span className="font-mono text-[22px] font-bold tracking-[-0.01em]">
        {formatCurrency(item.total_price)}
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- */

function WeightRail({
  inputRef,
  buffer,
  setBuffer,
  onInputKeyDown,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  buffer: string
  setBuffer: (v: string) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const parsed = parseManualWeight(buffer)
  const willLaunch = parsed != null && parsed > 0

  return (
    <div>
      {/* Sem cabo serial a balança está muda, e este é o estado normal —
          não um erro. O peso digitado é conferido contra o visor da balança,
          então é o segundo maior número da tela. */}
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-amber">
        Balança desconectada
      </span>
      <div className="mt-3 flex items-baseline gap-2.5">
        <span
          className={
            'font-mono text-[68px] font-bold leading-none tracking-[-0.04em] ' +
            (willLaunch ? 'text-ink' : 'text-ink-muted')
          }
        >
          {willLaunch ? parsed : '—'}
        </span>
        <span className="font-mono text-2xl text-ink-muted">g</span>
      </div>
      <p className="mt-3 min-h-10 text-sm leading-[1.45] text-ink-muted">
        {willLaunch
          ? `${formatWeight(parsed)} entra na comanda com Enter`
          : 'Sem leitura da balança. Digite o peso do próximo prato.'}
      </p>
      <input
        ref={inputRef}
        autoFocus
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={onInputKeyDown}
        placeholder="485"
        aria-label="Peso do prato em gramas ou quilos"
        autoComplete="off"
        spellCheck={false}
        className="mt-1 h-[52px] w-full rounded-[4px] border border-rule-strong bg-bg px-4 font-mono text-[19px] text-ink"
      />
      <p className="mt-2 text-[13px] leading-[1.35] text-ink-soft">
        Em gramas (<span className="font-mono">485</span>) ou quilos (
        <span className="font-mono">0,485</span>)
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- */

/**
 * O peso a partir do qual o a vontade fica mais barato que o por quilo.
 *
 * Sai so das duas tarifas, sem depender da balanca — e a informacao que faz a
 * escolha deixar de ser as cegas enquanto nao ha leitura automatica. Com
 * R$ 59,90 fixos contra R$ 79,90/kg, o ponto e 750 g.
 */
function breakEvenHint(rates: StationRates | null): string | null {
  const buffet = rates?.avontade?.price
  const perKg = rates?.por_kg?.price_per_kg
  if (!rates?.avontade?.ready || !rates?.por_kg?.ready) return null
  if (buffet == null || perKg == null || perKg <= 0) return null
  const grams = Math.round((buffet / perKg) * 1000)
  return `Acima de ${grams.toLocaleString('pt-BR')} g o à vontade sai na frente`
}

// Duas opções, na ordem do desenho: por quilo primeiro, porque é a que depende
// do peso e a que o cliente decide olhando o prato. A modalidade de 2 misturas
// existe no banco e continua valendo em comandas antigas, mas saiu da escolha
// do cliente — três caminhos numa tela de autoatendimento é um a mais.
const MODE_OPTIONS: {
  mode: ServiceMode
  title: string
  tone: 'amber' | 'teal'
}[] = [
  { mode: 'por_kg', title: 'Por quilo', tone: 'amber' },
  { mode: 'avontade', title: 'À vontade', tone: 'teal' },
]

function ModePicker({
  comandaLabel,
  rates,
  busy,
  trocando,
  onPick,
  inputRef,
  buffer,
  setBuffer,
  onInputKeyDown,
}: {
  comandaLabel: string
  rates: StationRates | null
  busy: boolean
  trocando: boolean
  onPick: (mode: ServiceMode) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  buffer: string
  setBuffer: (v: string) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[92px] shrink-0 items-baseline gap-3.5 border-b border-rule px-11">
        <p className="m-0 text-[26px] font-semibold tracking-[-0.02em]">
          Comanda <span className="font-mono font-bold">#{comandaLabel}</span>
        </p>
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-teal">
          {trocando ? 'trocando modalidade' : 'aberta'}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-[38px] px-16">
        <p className="text-2xl text-ink-soft">Como o cliente vai pagar?</p>

        {/* Duas colunas separadas por um fio de 1px, como no desenho: as
            opções são irmãs, não cartões soltos. A régua colorida no topo é
            o que distingue uma da outra — não há ícone. */}
        <div
          className="grid w-full max-w-[760px] gap-px overflow-hidden rounded-[4px] border border-rule bg-rule"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          {MODE_OPTIONS.map((opt) => {
            const rate = rates?.[opt.mode]
            // Sem tarifas carregadas ainda, a escolha segue liberada — quem
            // recusa modalidade sem produto é o lançamento, no servidor.
            const blocked = rates != null && rate?.ready === false
            const teal = opt.tone === 'teal'
            const price = teal
              ? rate?.price != null
                ? formatCurrency(rate.price)
                : null
              : rate?.price_per_kg != null
                ? `${formatCurrency(rate.price_per_kg)}/kg`
                : null
            const detail = blocked
              ? 'Sem produto cadastrado'
              : teal
                ? 'Quanto comer quiser, uma pessoa'
                : 'Pesa o prato na balança'

            return (
              <button
                key={opt.mode}
                onClick={() => onPick(opt.mode)}
                disabled={busy || blocked}
                className={
                  'flex flex-col items-start gap-3 border-t-[3px] bg-card px-[30px] pb-[26px] pt-7 text-left ' +
                  (teal ? 'border-teal' : 'border-amber') +
                  (blocked || busy ? ' cursor-not-allowed opacity-40' : '')
                }
              >
                <span className="flex w-full items-baseline gap-3">
                  <span
                    className={
                      'text-xs font-bold uppercase tracking-[0.12em] ' +
                      (teal ? 'text-teal' : 'text-amber')
                    }
                  >
                    {opt.title}
                  </span>
                </span>
                <span className="font-mono text-[48px] font-bold leading-none tracking-[-0.04em]">
                  {price ?? '—'}
                </span>
                <span className="text-[15px] leading-[1.4] text-ink-muted">
                  {detail}
                </span>
              </button>
            )
          })}
        </div>

        <p className="m-0 min-h-[21px] text-[15px] text-ink-muted">
          {breakEvenHint(rates) ?? 'Toque na opção'}
        </p>
      </div>

      <input
        ref={inputRef}
        autoFocus
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={onInputKeyDown}
        className="absolute h-0 w-0 opacity-0"
        aria-label="Modalidade"
      />
    </div>
  )
}

/* ---------------------------------------------------------------- */

function WeightGuard({
  grams,
  threshold,
  onCorrigir,
  onAceitar,
}: {
  grams: number
  threshold: number
  onCorrigir: () => void
  onAceitar: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Peso fora do normal"
      className="absolute inset-0 z-40 flex items-center justify-center px-16"
      style={{ background: 'var(--scrim)' }}
    >
      <div className="w-full max-w-[620px] rounded-[4px] border-t-4 border-amber bg-card-2 px-11 pb-9 pt-10 text-center">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-amber">
          Peso fora do normal
        </span>
        <p className="mt-[18px] font-mono text-[84px] font-bold leading-[0.92] tracking-[-0.05em] text-amber">
          {grams.toLocaleString('pt-BR')} g
        </p>
        <p className="mt-4 text-[21px] font-semibold">
          Isso é <span className="font-mono">{formatWeightProse(grams)}</span> — o
          normal vai até {formatWeightProse(threshold)}.
        </p>
        <p className="mb-[30px] mt-2.5 text-[17px] leading-[1.45] text-ink-soft">
          Confira se há mais de um prato na balança, ou algo apoiado nela.
        </p>
        <div className="flex justify-center gap-3">
          {/* Sem balança conectada não há o que repesar: o conserto é apagar
              e digitar de novo. */}
          <button
            onClick={onCorrigir}
            className="min-h-[60px] rounded-[4px] border border-rule-strong px-7 text-[17px] font-semibold text-ink"
          >
            Corrigir
          </button>
          <button
            onClick={onAceitar}
            className="min-h-[60px] rounded-[4px] bg-amber px-7 text-[17px] font-bold text-on-amber"
          >
            Lançar assim mesmo
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- */

function CancelSheet({
  items,
  busy,
  onCancelItem,
  onClose,
}: {
  items: StationItem[]
  busy: boolean
  onCancelItem: (itemId: string) => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end"
      style={{ background: 'var(--scrim-soft)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[660px] flex-col border-t-4 border-red bg-card-2"
      >
        <div className="flex shrink-0 items-center gap-5 border-b border-rule px-11 py-[26px]">
          <div className="min-w-0">
            <p className="m-0 text-xs font-bold uppercase tracking-[0.1em] text-red">
              Modo cancelamento · cartão do caixa
            </p>
            <p className="mt-1.5 text-[19px] text-ink-soft">
              Toque no item para cancelar. Unitário acima de 1 decrementa.
            </p>
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="min-h-[52px] shrink-0 rounded-[4px] border border-rule-strong px-5 text-base font-semibold text-ink-soft"
          >
            Sair do modo
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-11 pb-7 pt-2">
          {items.length === 0 ? (
            <p className="py-12 text-center text-[17px] text-ink-muted">
              Comanda vazia — nada para cancelar
            </p>
          ) : (
            items.map((item) => {
              const isWeight = item.weight_grams != null
              return (
                <button
                  key={item.id}
                  disabled={busy}
                  onClick={() => onCancelItem(item.id)}
                  className="-mx-3 grid w-[calc(100%+1.5rem)] grid-cols-[112px_minmax(0,1fr)_auto] items-baseline gap-[22px] border-b border-rule-faint px-3 py-[17px] text-left hover:bg-red-soft disabled:opacity-50"
                >
                  <span className="text-right font-mono text-lg font-bold text-ink-muted">
                    {isWeight ? formatWeight(item.weight_grams) : `${item.quantity} un`}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[19px] font-medium">
                      {item.product_name}
                    </span>
                    <span className="mt-[3px] block font-mono text-[13.5px] text-ink-muted">
                      {isWeight
                        ? `${formatCurrency(item.unit_price)}/kg`
                        : `${formatCurrency(item.unit_price)} cada`}
                    </span>
                  </span>
                  <span className="font-mono text-[22px] font-bold tracking-[-0.01em]">
                    {formatCurrency(item.total_price)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- */

function Toasts({ toasts, inset }: { toasts: Toast[]; inset: boolean }) {
  if (toasts.length === 0) return null
  return (
    <div
      className="pointer-events-none absolute bottom-[22px] left-0 z-50 flex flex-col items-center gap-2"
      // Centraliza na coluna de itens, não na tela: com a comanda aberta o
      // trilho da direita ocupa 420px e o aviso ficaria torto sobre ele. O
      // desconto de 493 é o do desenho — um pouco além da largura do trilho,
      // o que puxa o aviso pra esquerda do centro exato da coluna.
      style={{ width: inset ? 'calc(100% - 493px)' : '100%' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={
            'flex items-center gap-3 rounded-[4px] border-l-[3px] px-[22px] py-3.5 ' +
            (t.kind === 'ok'
              ? 'border-teal-edge bg-teal-soft text-teal'
              : 'border-red bg-red-soft text-red')
          }
          style={{ animation: 'est-land .18s ease-out' }}
        >
          <span className="whitespace-nowrap text-[17px] font-semibold">
            {t.text}
          </span>
        </div>
      ))}
    </div>
  )
}
