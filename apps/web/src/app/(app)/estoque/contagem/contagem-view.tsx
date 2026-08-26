'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import {
  countByBarcode,
  enableStockForBarcodedProducts,
  type CountedProduct,
} from './actions'

/**
 * Contagem de estoque pelo leitor.
 *
 * O fluxo e o do inventario de verdade: bipa a embalagem, digita quanto tem,
 * Enter, proxima. Sem mouse, sem procurar na lista, sem abrir modal — quem
 * conta fica com o leitor numa mao e a prateleira na frente.
 *
 * Cada Enter grava um ajuste com a diferenca contra o saldo atual, entao o
 * livro-razao nasce coerente com a prateleira e nao com um numero digitado do
 * nada.
 */
export function ContagemView({
  comCodigo,
  semControle,
  semCodigo,
}: {
  comCodigo: number
  semControle: number
  semCodigo: number
}) {
  const [barcode, setBarcode] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [pendente, setPendente] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [contados, setContados] = useState<CountedProduct[]>([])
  const [pending, startTransition] = useTransition()
  const [restantes, setRestantes] = useState(semControle)

  const barcodeRef = useRef<HTMLInputElement>(null)
  const qtdRef = useRef<HTMLInputElement>(null)

  // O leitor "digita" onde estiver o foco. Se o foco escapar, a proxima bipada
  // se perde — entao ele volta sozinho pro campo certo.
  useEffect(() => {
    const alvo = () => (pendente ? qtdRef.current : barcodeRef.current)
    alvo()?.focus()
    const refocus = () => alvo()?.focus()
    window.addEventListener('click', refocus)
    return () => window.removeEventListener('click', refocus)
  }, [pendente])

  function onBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = barcode.trim()
    if (!code) return
    setErro(null)
    setPendente(code)
    setBarcode('')
    setQuantidade('')
  }

  function onQtdKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelar()
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!pendente) return

    const n = Number(quantidade)
    if (!Number.isInteger(n) || n < 0) {
      setErro('Digite um numero inteiro, zero ou mais')
      return
    }

    const code = pendente
    startTransition(async () => {
      const res = await countByBarcode(code, n)
      if ('error' in res && res.error) {
        setErro(res.error)
        // Mantem o codigo pendente: o erro pode ser so a quantidade.
        return
      }
      if ('product' in res && res.product) {
        setContados((prev) => [res.product, ...prev])
        if (res.product.enabledNow) setRestantes((r) => Math.max(0, r - 1))
      }
      setPendente(null)
      setQuantidade('')
      setErro(null)
    })
  }

  function cancelar() {
    setPendente(null)
    setQuantidade('')
    setErro(null)
  }

  function ligarTodos() {
    setErro(null)
    startTransition(async () => {
      const res = await enableStockForBarcodedProducts()
      if ('error' in res && res.error) {
        setErro(res.error)
        return
      }
      if ('count' in res) setRestantes(0)
    })
  }

  const jaContados = new Set(contados.map((c) => c.id))

  return (
    <div>
      <PageHeader
        title="Contagem de estoque"
        subtitle="Bipe a embalagem, digite quanto tem na prateleira e aperte Enter. O saldo passa a ser o que voce contou."
        border={false}
      />

      {/* Ligar em lote: 64 produtos um a um pela tela de produtos seria
          insustentavel. Quem tem codigo de barras foi comprado pronto e se
          conta; o resto e feito na casa e nao tem o que contar. */}
      {restantes > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-rule bg-sunken px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">
              {restantes} {restantes === 1 ? 'produto ainda nao controla' : 'produtos ainda nao controlam'}{' '}
              estoque
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
              Bipar um produto liga o controle dele sozinho. Se preferir ligar
              todos de uma vez e so contar depois, use o botao — o saldo comeca
              em zero e a contagem preenche.
            </p>
          </div>
          <button
            type="button"
            onClick={ligarTodos}
            disabled={pending}
            className="h-11 shrink-0 rounded-[11px] border border-rule bg-overlay px-4 text-[13px] font-semibold text-ink transition-colors hover:bg-raise disabled:opacity-50"
          >
            Ligar nos {comCodigo} com codigo
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Coluna do leitor */}
        <section>
          <div className="panel p-5">
            {!pendente ? (
              <>
                <label
                  htmlFor="contagem-barcode"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted"
                >
                  Bipe a embalagem
                </label>
                <input
                  id="contagem-barcode"
                  ref={barcodeRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={onBarcodeKeyDown}
                  placeholder="Aguardando o leitor…"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-14 w-full rounded-[11px] border border-rule bg-field px-4 font-data text-[17px] text-ink placeholder:font-sans placeholder:text-[13px] placeholder:text-ink-muted"
                />
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
                  Ou digite o codigo e aperte Enter.
                </p>
              </>
            ) : (
              <>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                  Codigo
                </p>
                <p className="mb-4 font-data text-[15px] text-ink">{pendente}</p>

                <label
                  htmlFor="contagem-qtd"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted"
                >
                  Quantas unidades tem
                </label>
                <input
                  id="contagem-qtd"
                  ref={qtdRef}
                  value={quantidade}
                  onChange={(e) =>
                    setQuantidade(e.target.value.replace(/[^\d]/g, ''))
                  }
                  onKeyDown={onQtdKeyDown}
                  inputMode="numeric"
                  placeholder="0"
                  autoComplete="off"
                  className="h-14 w-full rounded-[11px] border border-teal bg-field px-4 font-data text-[24px] font-bold text-ink"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={cancelar}
                    className="h-11 flex-1 rounded-[11px] border border-rule text-[13px] font-semibold text-ink-soft hover:bg-sunken"
                  >
                    Cancelar · Esc
                  </button>
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
                  Enter grava e volta pro leitor.
                </p>
              </>
            )}

            {erro && (
              <p role="alert" className="mt-3 text-[12px] leading-relaxed text-red">
                {erro}
              </p>
            )}
            {pending && (
              <p className="mt-3 text-[12px] text-ink-muted">Gravando…</p>
            )}
          </div>

          <div className="mt-4 px-1 text-[11.5px] leading-relaxed text-ink-muted">
            <p>
              {jaContados.size} de {comCodigo} produtos com codigo ja contados
              nesta sessao.
            </p>
            {semCodigo > 0 && (
              <p className="mt-1">
                {semCodigo}{' '}
                {semCodigo === 1 ? 'produto fica de fora' : 'produtos ficam de fora'}{' '}
                por nao ter codigo — feitos na casa nao tem o que contar.
              </p>
            )}
          </div>
        </section>

        {/* Coluna do que foi contado */}
        <section>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            Contados agora
          </p>
          {contados.length === 0 ? (
            <EmptyState
              title="Nada contado ainda"
              hint="Cada produto que voce bipar aparece aqui, com a diferenca contra o saldo que estava no sistema."
            />
          ) : (
            <div className="divide-y divide-rule-faint">
              {contados.map((c, i) => (
                <div
                  key={`${c.id}-${i}`}
                  className="flex items-center gap-4 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {c.name}
                    </span>
                    <span className="mt-0.5 block font-data text-[11px] text-ink-muted">
                      {c.barcode}
                      {c.enabledNow && ' · controle ligado agora'}
                    </span>
                  </span>

                  {/* A diferenca e o que interessa numa contagem: e ela que
                      revela furo, perda ou lancamento errado. */}
                  <span
                    className={cn(
                      'w-16 shrink-0 text-right font-data text-[13px] font-semibold',
                      c.diff === 0
                        ? 'text-ink-muted'
                        : c.diff > 0
                          ? 'text-teal-deep'
                          : 'text-red'
                    )}
                  >
                    {c.diff === 0 ? 'bateu' : c.diff > 0 ? `+${c.diff}` : c.diff}
                  </span>
                  <span className="w-14 shrink-0 text-right">
                    <span className="block font-data text-[15px] font-semibold text-ink">
                      {c.after}
                    </span>
                    <span className="block font-data text-[10px] text-ink-muted">
                      era {c.before}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
