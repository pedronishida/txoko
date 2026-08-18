'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { QrCode, ScanLine, Scale, Package, X, CheckCircle2, AlertCircle, ChefHat, Ban, Trash2 } from 'lucide-react'
import { parseScan } from '@/lib/parse-scan'
import {
  resolveScan,
  resolveBarcode,
  addWeightItem,
  addBarcodeItem,
  cancelItem,
  setServiceMode,
  type StationSnapshot,
  type StationItem,
  type ServiceMode,
} from '@/lib/supabase'
import { formatCurrency, formatWeight, serviceModeLabel } from '@/lib/format'
import { BackgroundCameraScanner } from '@/components/camera-scanner'

type Toast = { id: number; kind: 'ok' | 'error'; text: string }

// Teclas do teclado numerico -> modalidade
const MODE_BY_KEY: Record<string, ServiceMode> = {
  '1': 'avontade',
  '2': 'por_kg',
  '3': 'por_kg_2mix',
}

// Acima disso pede confirmacao: protege do erro de digitar 4850 no lugar de
// 485. Prato de self-service raramente passa de 1,5 kg.
const WEIGHT_CONFIRM_THRESHOLD = 1500

function isPorKg(mode: ServiceMode | null): boolean {
  return mode === 'por_kg' || mode === 'por_kg_2mix'
}

/**
 * Le o peso do jeito que a atendente digitar, olhando pro visor da balanca:
 *   "485" / "485g" / "485 G"  -> 485 g
 *   "0,485" / "0.485" / "1,5" -> quilos, vira 485 g / 1500 g
 * Retorna null quando nao e peso (ai o texto segue pro leitor de barras).
 */
function parseManualWeight(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')

  const grams = s.match(/^(\d{1,4})g?$/)
  if (grams) return Number(grams[1])

  const kilos = s.match(/^(\d{1,2})[.,](\d{1,3})(?:kg)?$/)
  if (kilos) {
    const decimals = kilos[2].padEnd(3, '0')
    return Number(kilos[1]) * 1000 + Number(decimals)
  }

  return null
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

  const inputRef = useRef<HTMLInputElement>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const lastScanRef = useRef<{ value: string; ts: number } | null>(null)
  const cancelInFlightRef = useRef<boolean>(false)

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

  // Auto-encerra no tablet apos 5 minutos de inatividade (comanda segue aberta no DB)
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
  }

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

  // Peso digitado a mao (balanca do piloto nao imprime etiqueta)
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

      // Sem sessao ativa — so aceita QR do cartao (customer). Cancel card sem sessao = erro.
      if (!session) {
        // Codigo de barras do cartao e o caminho normal; o QR segue aceito
        // pros cartoes antigos, ja impressos.
        if (scan.kind !== 'card_barcode' && scan.kind !== 'qr_token') {
          pushToast('error', 'Bipe o codigo de barras do cartao primeiro')
          return
        }
        try {
          setBusy(true)

          // Os dois caminhos devolvem formatos diferentes: o do codigo de
          // barras ja traz o token, o do QR e o proprio token escaneado.
          let snap: StationSnapshot
          let sessionToken: string

          if (scan.kind === 'card_barcode') {
            const res = await resolveBarcode(scan.barcode)
            if (res.kind === 'cancel') {
              pushToast('error', 'Abra uma comanda antes de usar o cartao de cancelamento')
              return
            }
            snap = res.session
            sessionToken = res.qr_token
          } else {
            const res = await resolveScan(scan.token)
            if (res.kind === 'cancel') {
              pushToast('error', 'Abra uma comanda antes de usar o cartao de cancelamento')
              return
            }
            snap = res.session
            sessionToken = scan.token
          }

          setSession(snap)
          setToken(sessionToken)
          pushToast('ok', `Comanda ${snap.comanda_card.card_number} aberta`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro ao abrir comanda'
          pushToast('error', msg)
        } finally {
          setBusy(false)
        }
        return
      }

      // Sessao ativa — processa item OU abre drawer de cancelamento
      if (!token) return

      if (scan.kind === 'qr_token') {
        try {
          setBusy(true)
          const res = await resolveScan(scan.token)
          if (res.kind === 'cancel') {
            setCancelToken(scan.token)
            pushToast('ok', 'Modo cancelamento — toque no item pra cancelar')
          } else {
            pushToast('error', 'Ja existe uma comanda aberta')
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro'
          pushToast('error', msg)
        } finally {
          setBusy(false)
        }
        return
      }

      // Cartao de outro cliente bipado com comanda aberta: nao troca por
      // acidente — encerre a atual primeiro.
      if (scan.kind === 'card_barcode') {
        pushToast('error', 'Ja existe uma comanda aberta — finalize antes')
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
    [session, token, pushToast],
  )

  // O leitor HID "digita" no input + Enter ao final. Interceptamos via onKeyDown.
  // Um input so atende tudo: leitor HID, modalidade, pessoas e peso digitado.
  // Nao ha colisao — o leitor manda 8+ digitos (ou 32 hex do QR) e a digitacao
  // manual e sempre curta (1 a 4 digitos).
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
        pushToast('error', 'Aperte 1, 2 ou 3 pra escolher a modalidade')
      }
      return
    }

    // 3) "Por quilo": peso digitado (gramas ou quilos)
    //    (no "a vontade" nao ha digitacao: e uma comanda por pessoa, entao o
    //     valor fixo ja entrou sozinho ao escolher a modalidade)
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

    // 5) Resto e scan (QR do cartao, etiqueta de peso, codigo de barras)
    handleScan(v)
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-bg">
      {/* Conteudo principal */}
      {!session ? (
        <>
          <IdleView busy={busy} />
          {/* Input invisivel pra capturar HID scanner no idle */}
          <input
            ref={inputRef}
            autoFocus
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            onKeyDown={onInputKeyDown}
            className="absolute opacity-0 w-0 h-0 pointer-events-none"
            aria-hidden
          />
        </>
      ) : (
        <ActiveView
          session={session}
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
            // Guard contra double-fire de touch (mobile dispara touchend + click)
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
              // Libera apos 300ms — evita tap acidental em seguida
              setTimeout(() => {
                cancelInFlightRef.current = false
              }, 300)
            }
          }}
        />
      )}

      {/* Camera sempre ativa em background — dispara handleScan sem UI */}
      <BackgroundCameraScanner onScan={handleScan} />

      {/* Confirmacao de peso alto — protege do erro de digitacao */}
      {pendingWeight != null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-8">
          <div className="bg-bg-card border-2 border-warm rounded-2xl px-10 py-8 text-center max-w-lg">
            <AlertCircle size={44} className="text-warm mx-auto mb-4" />
            <div className="text-6xl font-mono font-bold text-fg tabular-nums mb-2">
              {pendingWeight} g
            </div>
            <p className="text-lg text-fg-muted mb-6">
              Peso acima do normal. Confira o visor da balanca antes de lancar.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setPendingWeight(null)}
                className="px-6 h-14 rounded-xl border-2 border-border text-fg-muted font-semibold text-lg"
              >
                Corrigir (Esc)
              </button>
              <button
                onClick={() => {
                  const grams = pendingWeight
                  setPendingWeight(null)
                  void applyManualWeight(grams)
                }}
                className="px-6 h-14 rounded-xl bg-warm text-black font-semibold text-lg"
              >
                Confirmar (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl backdrop-blur-sm font-medium ' +
              (t.kind === 'ok'
                ? 'bg-primary-soft text-primary border border-primary/30'
                : 'bg-coral-soft text-coral border border-coral/30')
            }
          >
            {t.kind === 'ok' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="text-base">{t.text}</span>
          </div>
        ))}
      </div>
    </main>
  )
}

function IdleView({ busy }: { busy: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8">
      <div className="w-48 h-48 rounded-3xl border-2 border-dashed border-border-strong flex items-center justify-center">
        <QrCode size={120} strokeWidth={1.25} className="text-fg-muted" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight text-fg">
          Bipe seu cartao
        </h1>
        <p className="text-lg text-fg-muted">
          Bipe o codigo de barras do cartao pra abrir sua comanda
        </p>
      </div>
      {busy && <div className="text-fg-muted text-sm">Abrindo...</div>}
    </div>
  )
}

function ActiveView({
  session,
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

  // Auto-scroll pro ultimo item
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [session.items.length])

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-border">
        <div className="flex items-center gap-4">
          <div
            className={
              'w-12 h-12 rounded-xl flex items-center justify-center ' +
              (mode === 'avontade'
                ? 'bg-primary-soft'
                : mode == null
                  ? 'bg-bg-card border border-border'
                  : 'bg-warm-soft')
            }
          >
            {mode === 'avontade' ? (
              <ChefHat size={22} className="text-primary" />
            ) : (
              <Scale size={22} className={mode == null ? 'text-fg-muted' : 'text-warm'} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-fg-muted">
                {serviceModeLabel(mode)}
              </span>
              {mode != null && !changingMode && (
                <button
                  onClick={onStartChangeMode}
                  disabled={busy}
                  className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-md border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
                >
                  Trocar
                </button>
              )}
            </div>
            <div className="text-2xl font-semibold">
              Comanda #{String(session.comanda_card.card_number).padStart(3, '0')}
            </div>
          </div>

        </div>

        <button
          onClick={onFinish}
          className="flex items-center gap-2 px-4 h-11 rounded-xl border-2 border-primary text-primary hover:bg-primary-soft text-sm font-semibold"
        >
          <CheckCircle2 size={16} />
          Finalizar
        </button>
      </header>

      {/* Items — ou o seletor de modalidade, que vem antes de tudo */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-8 py-4">
        {mode == null || changingMode ? (
          <ModePicker busy={busy} onPick={onPickMode} trocando={changingMode} />
        ) : session.items.length === 0 ? (
          <EmptyHint mode={mode} />
        ) : (
          <ul className="space-y-2">
            {session.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-4 px-5 py-4 rounded-xl bg-bg-card border border-border"
              >
                <div
                  className={
                    'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ' +
                    (item.weight_grams != null ? 'bg-warm-soft' : 'bg-primary-soft')
                  }
                >
                  {item.weight_grams != null ? (
                    <Scale size={18} className="text-warm" />
                  ) : (
                    <Package size={18} className="text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-fg truncate">{item.product_name}</div>
                  <div className="text-sm text-fg-muted font-mono">
                    {item.weight_grams != null
                      ? `${formatWeight(item.weight_grams)} × ${formatCurrency(item.unit_price)}/kg`
                      : `${item.quantity} × ${formatCurrency(item.unit_price)}`}
                  </div>
                </div>
                <div className="font-mono font-semibold text-fg text-lg shrink-0">
                  {formatCurrency(item.total_price)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer: peso digitado (por quilo) + total */}
      <footer className="border-t border-border px-8 py-5 bg-bg-card">
        <div className="flex items-end justify-between gap-6">
          <div className="flex-1 min-w-0">
            {isPorKg(mode) && (
              <div className="mb-3">
                <div className="flex items-center gap-2 text-fg-muted mb-1">
                  <Scale size={14} />
                  <span className="text-xs uppercase tracking-wide">Peso em gramas</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-mono font-bold tabular-nums text-fg leading-none">
                    {parseManualWeight(buffer) ?? '—'}
                  </span>
                  <span className="text-2xl font-mono text-fg-muted">g</span>
                </div>
                <div className="text-xs text-fg-muted mt-1">
                  Digite em gramas (485) ou quilos (0,485) e Enter
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-fg-muted mb-2">
              <ScanLine size={14} />
              <span className="text-xs">
                {busy
                  ? 'Processando...'
                  : mode == null
                    ? 'Aperte 1, 2 ou 3 pra escolher a modalidade'
                    : mode === 'avontade'
                        ? 'Escaneie as bebidas do cliente'
                      : 'Escaneie bebidas — ou digite o peso + Enter'}
              </span>
            </div>
            <input
              ref={inputRef}
              autoFocus
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Codigo (QR, EAN, barcode)"
              className="w-full max-w-md px-4 h-11 bg-bg border border-border rounded-lg font-mono text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-primary"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs uppercase tracking-wide text-fg-muted">Total</div>
            <div className="text-4xl font-mono font-bold text-fg">
              {formatCurrency(session.total)}
            </div>
          </div>
        </div>
      </footer>

      {cancelToken && (
        <CancelDrawer
          items={session.items}
          busy={busy}
          onCancelItem={onCancelItem}
          onClose={onCloseCancelMode}
        />
      )}
    </div>
  )
}

const MODE_OPTIONS: {
  key: string
  mode: ServiceMode
  title: string
  hint: string
}[] = [
  { key: '1', mode: 'avontade', title: 'A Vontade', hint: 'Preco fixo por pessoa' },
  { key: '2', mode: 'por_kg', title: 'Por Quilo', hint: 'Pesa o prato' },
  { key: '3', mode: 'por_kg_2mix', title: '2 Misturas', hint: 'Por quilo, outro preco' },
]

function ModePicker({
  busy,
  onPick,
  trocando,
}: {
  busy: boolean
  onPick: (mode: ServiceMode) => void
  trocando?: boolean
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-8">
      <div className="text-center space-y-1">
        <h2 className="text-3xl font-semibold tracking-tight text-fg">
          {trocando ? 'Trocar modalidade' : 'Qual a modalidade?'}
        </h2>
        <p className="text-fg-muted">Aperte 1, 2 ou 3 — ou toque na opcao</p>
      </div>

      <div className="grid grid-cols-3 gap-4 w-full max-w-4xl">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            onClick={() => onPick(opt.mode)}
            disabled={busy}
            className="flex flex-col items-center gap-3 px-6 py-8 rounded-2xl bg-bg-card border-2 border-border hover:border-primary active:scale-[0.98] transition disabled:opacity-40"
          >
            <div className="w-14 h-14 rounded-xl bg-bg border border-border flex items-center justify-center text-3xl font-mono font-bold text-fg">
              {opt.key}
            </div>
            {opt.mode === 'avontade' ? (
              <ChefHat size={30} className="text-primary" />
            ) : (
              <Scale size={30} className="text-warm" />
            )}
            <div className="text-center">
              <div className="text-xl font-semibold text-fg leading-tight">{opt.title}</div>
              <div className="text-sm text-fg-muted">{opt.hint}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function CancelDrawer({
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
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-h-[85vh] bg-bg-card border-t-2 border-coral rounded-t-2xl shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-coral/15 flex items-center justify-center">
              <Ban size={18} className="text-coral" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-coral font-semibold">
                Modo cancelamento (caixa)
              </div>
              <div className="text-sm text-fg-muted">
                Toque no item pra cancelar. Unitario {'>'} 1 decrementa.
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 h-10 rounded-xl border border-border text-fg-muted hover:text-fg hover:bg-border text-sm"
          >
            <X size={16} />
            Sair do modo
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 no-scrollbar">
          {items.length === 0 ? (
            <div className="py-12 text-center text-fg-muted text-sm">
              Comanda vazia — nada pra cancelar
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    disabled={busy}
                    onClick={() => onCancelItem(item.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-xl bg-bg border border-border hover:border-coral hover:bg-coral/5 disabled:opacity-50 text-left transition-colors"
                  >
                    <div
                      className={
                        'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ' +
                        (item.weight_grams != null ? 'bg-warm-soft' : 'bg-primary-soft')
                      }
                    >
                      {item.weight_grams != null ? (
                        <Scale size={18} className="text-warm" />
                      ) : (
                        <Package size={18} className="text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-fg truncate">{item.product_name}</div>
                      <div className="text-sm text-fg-muted font-mono">
                        {item.weight_grams != null
                          ? `${formatWeight(item.weight_grams)} × ${formatCurrency(item.unit_price)}/kg`
                          : `${item.quantity} × ${formatCurrency(item.unit_price)}`}
                      </div>
                    </div>
                    <div className="font-mono font-semibold text-fg text-lg shrink-0">
                      {formatCurrency(item.total_price)}
                    </div>
                    <Trash2 size={18} className="text-coral shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyHint({ mode }: { mode: ServiceMode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-12">
      <div className="flex gap-3">
        {isPorKg(mode) && (
          <div className="flex flex-col items-center gap-2 px-6 py-5 rounded-xl bg-bg-card border border-border min-w-[180px]">
            <Scale size={32} className="text-warm" />
            <div className="text-sm text-fg-muted leading-tight">
              Peso em gramas
              <br />
              digitado ou etiqueta
            </div>
          </div>
        )}
        <div className="flex flex-col items-center gap-2 px-6 py-5 rounded-xl bg-bg-card border border-border min-w-[180px]">
          <Package size={32} className="text-primary" />
          <div className="text-sm text-fg-muted leading-tight">
            Codigo de barras
            <br />
            do produto
          </div>
        </div>
      </div>
      <p className="text-fg-muted text-sm mt-2">
        {isPorKg(mode)
          ? 'Digite o peso do prato ou escaneie as bebidas.'
          : 'Escaneie as bebidas que o cliente pedir.'}
      </p>
    </div>
  )
}
