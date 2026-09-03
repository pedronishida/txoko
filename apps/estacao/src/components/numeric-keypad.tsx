'use client'

import { useState } from 'react'
import { formatWeight, formatWeightProse } from '@/lib/format'

/**
 * Teclado numerico na tela.
 *
 * Existe porque a estacao roda numa tela touch sem teclado fisico e a
 * balanca ainda nao conversa com o aparelho — digitar e o unico caminho do
 * peso. So digitos, sempre em gramas: e o numero que o visor da balanca
 * mostra em corpo grande, entao a conferencia e de relance.
 *
 * Texto nas teclas de acao, nao icone — mesma regra do resto da estacao.
 */

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

// 4 digitos = 9.999 g, o mesmo teto do parseManualWeight. Acima de 1.500 g o
// WeightGuard ja pede confirmacao; o teto aqui so barra numero sem sentido.
const MAX_DIGITS = 4

export function NumericKeypad({
  busy,
  onConfirm,
  onClose,
  altLabel,
  onAlt,
  titulo = 'Peso do prato',
  verbo = 'Lançar',
  inicial,
}: {
  busy: boolean
  onConfirm: (grams: number) => void
  onClose: () => void
  /** Atalho secundario abaixo do confirmar (ex.: a vontade, sem pesar). */
  altLabel?: string
  onAlt?: () => void
  /** Rotulo do canto — o mesmo teclado tambem ajusta a tara. */
  titulo?: string
  /** Verbo do botao de confirmar: "Lançar" o prato, "Salvar" a tara. */
  verbo?: string
  /** Valor ja digitado ao abrir, pra corrigir em vez de redigitar. */
  inicial?: number
}) {
  const [digits, setDigits] = useState(
    inicial != null && inicial > 0 ? String(inicial) : ''
  )
  const grams = digits === '' ? null : Number(digits)
  const ok = grams != null && grams > 0

  const tap = (d: string) =>
    setDigits((prev) => {
      if (prev.length >= MAX_DIGITS) return prev
      return prev === '0' ? d : prev + d
    })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Digitar peso do prato"
      className="absolute inset-0 z-40 flex items-center justify-center px-16"
      style={{ background: 'var(--scrim)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-[4px] border-t-4 border-amber bg-card-2 px-8 pb-8 pt-7"
        style={{ animation: 'est-land .18s ease-out' }}
      >
        <div className="flex items-baseline">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-amber">
            {titulo}
          </span>
          <span className="flex-1" />
          <button
            onClick={onClose}
            className="min-h-11 rounded-[4px] px-3 text-[15px] font-semibold text-ink-soft"
          >
            Cancelar
          </button>
        </div>

        {/* O numero digitado e conferido contra o visor da balanca, entao tem
            a mesma forma do visor: mono, grande, em gramas. */}
        <div className="mt-1 flex items-baseline justify-end gap-2.5 border-b border-rule pb-4">
          <span
            className={
              'font-mono text-[56px] font-bold leading-none tracking-[-0.04em] ' +
              (ok ? 'text-ink' : 'text-ink-muted')
            }
          >
            {digits || '—'}
          </span>
          <span className="font-mono text-2xl text-ink-muted">g</span>
        </div>
        <p className="m-0 mt-2 min-h-[18px] text-right font-mono text-[13px] text-ink-muted">
          {ok && grams >= 1000 ? formatWeightProse(grams) : ''}
        </p>

        <div className="mt-2 grid grid-cols-3 gap-2">
          {DIGITS.map((d) => (
            <button
              key={d}
              onClick={() => tap(d)}
              className="h-[72px] rounded-[4px] border border-rule bg-card font-mono text-[28px] font-bold text-ink active:bg-teal-soft"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setDigits('')}
            disabled={digits === ''}
            className="h-[72px] rounded-[4px] border border-rule bg-card text-[15px] font-semibold text-ink-soft active:bg-red-soft disabled:opacity-40"
          >
            zerar
          </button>
          <button
            onClick={() => tap('0')}
            className="h-[72px] rounded-[4px] border border-rule bg-card font-mono text-[28px] font-bold text-ink active:bg-teal-soft"
          >
            0
          </button>
          <button
            onClick={() => setDigits((p) => p.slice(0, -1))}
            disabled={digits === ''}
            className="h-[72px] rounded-[4px] border border-rule bg-card text-[15px] font-semibold text-ink-soft active:bg-red-soft disabled:opacity-40"
          >
            apagar
          </button>
        </div>

        <button
          disabled={!ok || busy}
          onClick={() => {
            if (ok) onConfirm(grams)
          }}
          className="mt-3 h-[64px] w-full rounded-[4px] bg-teal text-lg font-bold text-on-accent disabled:opacity-40"
        >
          {ok ? `${verbo} ${formatWeight(grams)}` : 'Digite o peso em gramas'}
        </button>

        {onAlt != null && altLabel != null && (
          <button
            disabled={busy}
            onClick={onAlt}
            className="mt-2 h-14 w-full rounded-[4px] border border-rule-strong text-base font-semibold text-ink-soft disabled:opacity-40"
          >
            {altLabel}
          </button>
        )}
      </div>
    </div>
  )
}
