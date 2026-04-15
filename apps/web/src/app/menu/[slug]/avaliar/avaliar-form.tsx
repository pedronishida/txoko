'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Send, Sparkles, Star } from 'lucide-react'

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
      <div className="min-h-screen bg-night flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-leaf/10 flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-leaf" />
          </div>
          <h1 className="text-2xl font-bold text-cloud">Obrigado!</h1>
          <p className="text-sm text-stone-light">
            Sua avaliacao foi enviada. Ela ajuda o {restaurantName} a melhorar cada dia.
          </p>
          <Link
            href={`/menu/${slug}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-night-light border border-night-lighter rounded-lg text-sm text-stone-light hover:text-cloud transition-colors"
          >
            <ArrowLeft size={14} />
            Voltar ao cardapio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-night pb-12">
      <div className="max-w-lg mx-auto px-4 pt-6">
        <Link
          href={`/menu/${slug}${tableNumber ? `?mesa=${tableNumber}` : ''}`}
          className="inline-flex items-center gap-1 text-xs text-stone hover:text-cloud transition-colors mb-6"
        >
          <ArrowLeft size={12} />
          Voltar
        </Link>

        <div className="text-center space-y-1 mb-8">
          <h1 className="text-2xl font-bold text-cloud">Como foi sua experiencia?</h1>
          <p className="text-sm text-stone">{restaurantName}</p>
          {tableNumber && (
            <p className="text-xs text-leaf font-data">Mesa {tableNumber}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-night-light border border-night-lighter rounded-2xl p-5">
            <label className="block text-sm text-stone-light mb-3 text-center">
              Sua nota
            </label>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    size={36}
                    className={
                      n <= (hover || rating)
                        ? 'text-warm fill-warm'
                        : 'text-stone/30'
                    }
                  />
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-stone mt-2">
              {['', 'Muito ruim', 'Ruim', 'Ok', 'Bom', 'Excelente'][rating]}
            </p>
          </div>

          <div className="bg-night-light border border-night-lighter rounded-2xl p-5">
            <label className="block text-sm text-stone-light mb-3 text-center">
              Voce recomendaria para um amigo?
            </label>
            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNps(n === nps ? null : n)}
                  className={`h-10 rounded-lg text-xs font-data font-bold transition-colors ${
                    nps === n
                      ? n >= 9
                        ? 'bg-primary text-white'
                        : n >= 7
                        ? 'bg-accent text-black'
                        : 'bg-coral text-white'
                      : 'bg-night border border-night-lighter text-stone-light hover:text-cloud'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px] text-stone">
              <span>Nao recomendaria</span>
              <span>Com certeza</span>
            </div>
          </div>

          <div className="bg-night-light border border-night-lighter rounded-2xl p-5">
            <label className="block text-sm text-stone-light mb-2">
              Quer contar mais? (opcional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="O que voce mais gostou? Algo pode melhorar?"
              className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            />
            <p className="text-[10px] text-stone mt-2 flex items-center gap-1">
              <Sparkles size={10} className="text-leaf" />
              Seu comentario sera analisado por IA para alertar o gestor em caso de
              problema.
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 bg-coral/10 border border-coral/30 rounded-xl text-sm text-coral">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {submitting ? (
              'Enviando...'
            ) : (
              <>
                <Send size={16} />
                Enviar Avaliacao
              </>
            )}
          </button>

          <p className="text-center text-[10px] text-stone">
            Sua avaliacao e anonima. Nao coletamos dados pessoais.
          </p>
        </form>
      </div>
    </div>
  )
}
