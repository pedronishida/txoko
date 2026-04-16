'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  slug: string
  restaurantName: string
  tableNumber: number | null
}

export function AvaliarForm({ slug, restaurantName, tableNumber }: Props) {
  const [rating, setRating] = useState(5)
  const [hover, setHover] = useState(0)
  const [nps, setNps] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          rating,
          nps,
          comment: comment.trim() || null,
          table_number: tableNumber,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar')
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-5">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-[28px] font-medium text-foreground tracking-[-0.03em] leading-none">
            Obrigado
          </h1>
          <p className="text-[13px] text-muted mt-3 tracking-tight">
            Sua avaliacao foi enviada. Ela ajuda o {restaurantName} a melhorar
            cada dia.
          </p>
          <Link
            href={`/menu/${slug}`}
            className="inline-flex items-center mt-8 text-[12px] text-muted hover:text-foreground transition-colors tracking-tight"
          >
            ← Voltar ao cardapio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg pb-16">
      <div className="max-w-md mx-auto px-5 pt-6">
        <Link
          href={`/menu/${slug}${tableNumber ? `?mesa=${tableNumber}` : ''}`}
          className="inline-flex items-center text-[11px] text-muted hover:text-foreground transition-colors tracking-tight mb-10"
        >
          ← Voltar
        </Link>

        <header className="mb-12 text-center">
          <h1 className="text-[26px] font-medium text-foreground tracking-[-0.03em] leading-none">
            Como foi sua experiencia?
          </h1>
          <p className="text-[13px] text-muted mt-3 tracking-tight">
            {restaurantName}
            {tableNumber && (
              <span className="font-data ml-1.5">· Mesa {tableNumber}</span>
            )}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-10">
          {/* Rating */}
          <section>
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted mb-4 text-center">
              Sua nota
            </label>
            <div className="flex items-center justify-center gap-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  className={cn(
                    'w-12 h-12 text-[22px] transition-colors',
                    n <= (hover || rating)
                      ? 'text-foreground'
                      : 'text-muted/30 hover:text-muted'
                  )}
                >
                  {n <= (hover || rating) ? '★' : '·'}
                </button>
              ))}
            </div>
            <p className="text-center text-[11px] text-muted mt-3 tracking-tight">
              {['', 'Muito ruim', 'Ruim', 'Ok', 'Bom', 'Excelente'][rating]}
            </p>
          </section>

          {/* NPS */}
          <section>
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted mb-4 text-center">
              Voce recomendaria para um amigo?
            </label>
            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, i) => i).map((n) => {
                const active = nps === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNps(n === nps ? null : n)}
                    className={cn(
                      'h-10 rounded-md text-[11px] font-data font-medium transition-colors',
                      active
                        ? 'bg-foreground text-bg'
                        : 'text-muted hover:text-foreground hover:bg-[var(--surface)]'
                    )}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px] text-muted tracking-tight">
              <span>Nao recomendaria</span>
              <span>Com certeza</span>
            </div>
          </section>

          {/* Comment */}
          <section>
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted mb-3">
              Quer contar mais?
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="O que voce mais gostou? Algo pode melhorar?"
              className="w-full px-3.5 py-3 bg-[var(--surface)] border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-[var(--border-strong)] resize-none transition-colors tracking-tight"
            />
            <p className="text-[10px] text-muted mt-2 tracking-tight">
              Seu comentario sera analisado por IA para alertar o gestor em
              caso de problema.
            </p>
          </section>

          {error && (
            <div className="px-3.5 py-2.5 bg-[var(--destructive-soft)] border border-[var(--destructive)]/20 rounded-md text-[12px] text-[var(--destructive)] tracking-tight">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 bg-foreground text-bg text-[13px] font-medium rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? 'Enviando' : 'Enviar avaliacao'}
          </button>

          <p className="text-center text-[10px] text-muted tracking-tight">
            Sua avaliacao e anonima. Nao coletamos dados pessoais.
          </p>
        </form>
      </div>
    </div>
  )
}
