'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { QrCode, ScanLine, Scale, Package, X, CheckCircle2, AlertCircle, ChefHat, Ban, Trash2 } from 'lucide-react'
import { parseScan } from '@/lib/parse-scan'
import {
  resolveScan,
  addWeightItem,
  addBarcodeItem,
  cancelItem,
  type StationSnapshot,
  type StationItem,
} from '@/lib/supabase'
import { formatCurrency, formatWeight } from '@/lib/format'
import { BackgroundCameraScanner } from '@/components/camera-scanner'

type Toast = { id: number; kind: 'ok' | 'error'; text: string }

export default function StationPage() {
  const [session, setSession] = useState<StationSnapshot | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [cancelToken, setCancelToken] = useState<string | null>(null)
  const [buffer, setBuffer] = useState('')
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

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
  }

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
        if (scan.kind !== 'qr_token') {
          pushToast('error', 'Escaneie o QR do cartao primeiro')
          return
        }
        try {
          setBusy(true)
          const res = await resolveScan(scan.token)
          if (res.kind === 'cancel') {
            pushToast('error', 'Abra uma comanda antes de usar o cartao de cancelamento')
            return
          }
          setSession(res.session)
          setToken(scan.token)
          pushToast('ok', `Comanda ${res.session.comanda_card.card_number} aberta`)
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
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = e.currentTarget.value
      e.currentTarget.value = ''
      setBuffer('')
      if (v.trim()) handleScan(v)
    }
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
          Escaneie seu cartao
        </h1>
        <p className="text-lg text-fg-muted">
          Aproxime o QR do cartao no leitor pra abrir sua comanda
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
  cancelToken: string | null
  onCloseCancelMode: () => void
  onCancelItem: (itemId: string) => void
}) {
  const mode = session.comanda_card.service_mode
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
              (mode === 'avontade' ? 'bg-primary-soft' : 'bg-warm-soft')
            }
          >
            {mode === 'avontade' ? (
              <ChefHat size={22} className="text-primary" />
            ) : (
              <Scale size={22} className="text-warm" />
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-fg-muted">
              {mode === 'avontade' ? 'A Vontade' : 'Por Quilo'}
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

      {/* Items */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-8 py-4">
        {session.items.length === 0 ? (
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

      {/* Footer com total */}
      <footer className="border-t border-border px-8 py-5 bg-bg-card">
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-fg-muted mb-2">
              <ScanLine size={14} />
              <span className="text-xs">
                {busy ? 'Processando...' : 'Escaneie ou digite o codigo + Enter'}
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

function EmptyHint({ mode }: { mode: 'avontade' | 'por_kg' }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-12">
      <div className="flex gap-3">
        {mode === 'por_kg' && (
          <div className="flex flex-col items-center gap-2 px-6 py-5 rounded-xl bg-bg-card border border-border min-w-[180px]">
            <Scale size={32} className="text-warm" />
            <div className="text-sm text-fg-muted leading-tight">
              Etiqueta de peso
              <br />
              da balanca
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
      <p className="text-fg-muted text-sm mt-2">Escaneie os itens que voce quer lancar nesta comanda.</p>
    </div>
  )
}
