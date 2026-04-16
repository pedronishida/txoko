'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Customer, Review, ReviewSentiment } from '@txoko/shared'
import { Plus, X } from 'lucide-react'
import { createReview } from './actions'

type SentimentFilter = 'all' | ReviewSentiment

const SENTIMENT_LABEL: Record<ReviewSentiment, string> = {
  positive: 'Positivo',
  neutral: 'Neutro',
  negative: 'Negativo',
}

const SOURCE_LABEL: Record<string, string> = {
  internal: 'Txoko',
  google: 'Google',
  ifood: 'iFood',
  qrcode: 'QR code',
}

type Props = {
  reviews: Review[]
  customers: Pick<Customer, 'id' | 'name'>[]
  restaurantId: string
}

export function AvaliacoesView({
  reviews: initialReviews,
  customers,
  restaurantId,
}: Props) {
  const [reviews, setReviews] = useState(initialReviews)
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`avaliacoes-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reviews',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setReviews((prev) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as Review
              return prev.some((r) => r.id === row.id) ? prev : [row, ...prev]
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as Review
              return prev.map((r) => (r.id === row.id ? row : r))
            }
            if (payload.eventType === 'DELETE') {
              const row = payload.old as Review
              return prev.filter((r) => r.id !== row.id)
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId])

  const [formRating, setFormRating] = useState(5)
  const [formNps, setFormNps] = useState<string>('')
  const [formComment, setFormComment] = useState('')
  const [formCustomerId, setFormCustomerId] = useState('')
  const [formAnonymous, setFormAnonymous] = useState(false)

  const filtered = useMemo(() => {
    if (sentimentFilter === 'all') return reviews
    return reviews.filter((r) => r.sentiment === sentimentFilter)
  }, [reviews, sentimentFilter])

  const stats = useMemo(() => {
    if (reviews.length === 0) {
      return {
        avg: 0,
        nps: 0,
        total: 0,
        sentiments: { positive: 0, neutral: 0, negative: 0 },
      }
    }
    const avg =
      reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length
    const npsScores = reviews
      .filter((r) => r.nps !== null && r.nps !== undefined)
      .map((r) => Number(r.nps))
    let nps = 0
    if (npsScores.length > 0) {
      const promoters = npsScores.filter((n) => n >= 9).length
      const detractors = npsScores.filter((n) => n <= 6).length
      nps = Math.round(((promoters - detractors) / npsScores.length) * 100)
    }
    const sentiments = {
      positive: reviews.filter((r) => r.sentiment === 'positive').length,
      neutral: reviews.filter((r) => r.sentiment === 'neutral').length,
      negative: reviews.filter((r) => r.sentiment === 'negative').length,
    }
    return { avg, nps, total: reviews.length, sentiments }
  }, [reviews])

  const ratingDistribution = useMemo(() => {
    const dist = [0, 0, 0, 0, 0]
    reviews.forEach((r) => {
      const idx = Number(r.rating) - 1
      if (idx >= 0 && idx < 5) dist[idx]++
    })
    return dist
  }, [reviews])

  function handleSave() {
    if (formRating < 1 || formRating > 5) return
    startTransition(async () => {
      const res = await createReview({
        rating: formRating,
        nps: formNps ? parseInt(formNps, 10) : null,
        comment: formComment,
        customer_id: formAnonymous ? null : formCustomerId || null,
        is_anonymous: formAnonymous,
        source: 'internal',
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setShowForm(false)
      setFormRating(5)
      setFormNps('')
      setFormComment('')
      setFormCustomerId('')
      setFormAnonymous(false)
    })
  }

  function formatDate(d: string) {
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (days === 0) return 'Hoje'
    if (days === 1) return 'Ontem'
    if (days < 7) return `${days}d`
    return new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    })
  }

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, i) => (i < rating ? '★' : '·')).join('')
  }

  return (
    <div className="-mx-8 -mt-6">
      {/* Header */}
      <header className="px-8 pt-6 pb-8 border-b border-night-lighter flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
            Avaliacoes
          </h1>
          <p className="text-[13px] text-stone mt-2 tracking-tight">
            Sentimento classificado automaticamente pelo Claude
          </p>
        </div>
        <button
          onClick={() => {
            setError(null)
            setShowForm(true)
          }}
          className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
        >
          <Plus size={14} strokeWidth={2} />
          Nova avaliacao
        </button>
      </header>

      {/* KPI band */}
      <section className="px-8 py-8 border-b border-night-lighter grid grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-8">
        <Metric
          label="NPS"
          value={String(stats.nps)}
          caption={
            stats.nps >= 70
              ? 'Excelente'
              : stats.nps >= 50
                ? 'Bom'
                : 'Precisa melhorar'
          }
        />
        <Metric
          label="Nota media"
          value={stats.avg.toFixed(1)}
          caption={renderStars(Math.round(stats.avg))}
        />
        <Metric label="Total" value={String(stats.total)} />
        <Metric
          label="Sentimento"
          value={
            stats.total > 0
              ? `${Math.round((stats.sentiments.positive / stats.total) * 100)}%`
              : '—'
          }
          caption={
            stats.total > 0
              ? `${Math.round((stats.sentiments.negative / stats.total) * 100)}% negativo`
              : 'Sem dados'
          }
        />
      </section>

      <div className="px-8 py-10 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-x-12 gap-y-10">
        {/* Distribution */}
        <aside>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-5">
            Distribuicao
          </h2>
          <div className="space-y-2.5">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = ratingDistribution[rating - 1]
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              return (
                <div key={rating} className="flex items-center gap-3">
                  <span className="text-[11px] font-data text-stone-dark w-3">
                    {rating}
                  </span>
                  <div className="flex-1 h-0.5 bg-night-lighter rounded-full overflow-hidden">
                    <div
                      className="h-full bg-stone-light rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-data text-stone-dark w-6 text-right">
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </aside>

        {/* List */}
        <section>
          <div className="flex items-center gap-5 mb-6 pb-4 border-b border-night-lighter">
            {(['all', 'positive', 'neutral', 'negative'] as const).map((s) => {
              const count =
                s === 'all' ? stats.total : stats.sentiments[s]
              const active = sentimentFilter === s
              return (
                <button
                  key={s}
                  onClick={() => setSentimentFilter(s)}
                  className={cn(
                    'relative text-[12px] font-medium tracking-tight transition-colors pb-4 -mb-4',
                    active ? 'text-cloud' : 'text-stone hover:text-stone-light'
                  )}
                >
                  {s === 'all' ? 'Todas' : SENTIMENT_LABEL[s]}
                  <span className="ml-1.5 text-[10px] font-data text-stone-dark">
                    {count}
                  </span>
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-px h-px bg-cloud" />
                  )}
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-stone tracking-tight">
              Nenhuma avaliacao ainda
            </p>
          ) : (
            <div className="divide-y divide-night-lighter">
              {filtered.map((review) => (
                <article key={review.id} className="py-5">
                  <div className="flex items-baseline justify-between gap-4 mb-2">
                    <div className="flex items-baseline gap-3">
                      <span className="text-[13px] font-medium text-cloud font-data tracking-tight">
                        {Number(review.rating).toFixed(1)}
                      </span>
                      <span className="text-[10px] text-stone-dark tracking-tight">
                        {renderStars(Number(review.rating))}
                      </span>
                      {review.nps !== null && review.nps !== undefined && (
                        <span
                          className={cn(
                            'text-[10px] font-data tracking-tight',
                            review.nps >= 9
                              ? 'text-leaf'
                              : review.nps >= 7
                                ? 'text-warm'
                                : 'text-primary'
                          )}
                        >
                          NPS {review.nps}
                        </span>
                      )}
                      {review.sentiment && (
                        <span
                          className={cn(
                            'text-[10px] tracking-tight',
                            review.sentiment === 'positive' && 'text-leaf',
                            review.sentiment === 'negative' && 'text-primary',
                            review.sentiment === 'neutral' && 'text-stone'
                          )}
                        >
                          {SENTIMENT_LABEL[review.sentiment]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 shrink-0">
                      <span className="text-[10px] text-stone-dark tracking-tight">
                        {SOURCE_LABEL[review.source] || review.source}
                      </span>
                      <span className="text-[10px] font-data text-stone-dark">
                        {formatDate(review.created_at)}
                      </span>
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-[13px] text-stone-light leading-relaxed tracking-tight">
                      {review.comment}
                    </p>
                  )}
                  {review.is_anonymous && (
                    <p className="text-[10px] text-stone-dark mt-1.5 tracking-tight">
                      Anonima
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between">
              <h2 className="text-[14px] font-medium text-cloud tracking-tight">
                Nova avaliacao
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {error && (
                <div className="px-3 py-2 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                  Nota
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setFormRating(n)}
                      className={cn(
                        'w-9 h-9 text-[18px] font-data transition-colors',
                        n <= formRating ? 'text-cloud' : 'text-stone-dark hover:text-stone'
                      )}
                    >
                      {n <= formRating ? '★' : '·'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                  NPS (0–10, opcional)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={formNps}
                  onChange={(e) => setFormNps(e.target.value)}
                  className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud font-data focus:outline-none focus:border-stone-dark transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                  Comentario
                </label>
                <textarea
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  rows={3}
                  placeholder="O que o cliente achou?"
                  className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark resize-none transition-colors"
                />
                <p className="text-[10px] text-stone-dark mt-2 tracking-tight">
                  Sentimento sera classificado automaticamente pelo Claude
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[12px] text-stone-light cursor-pointer tracking-tight">
                  <input
                    type="checkbox"
                    checked={formAnonymous}
                    onChange={(e) => setFormAnonymous(e.target.checked)}
                    className="accent-cloud"
                  />
                  Anonima
                </label>
                {!formAnonymous && (
                  <select
                    value={formCustomerId}
                    onChange={(e) => setFormCustomerId(e.target.value)}
                    className="flex-1 h-9 px-3 bg-night border border-night-lighter rounded-md text-[12px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
                  >
                    <option value="">Cliente (opcional)</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
                >
                  {pending ? 'Classificando' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  caption,
}: {
  label: string
  value: string
  caption?: string
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
        {label}
      </p>
      <p className="text-[28px] font-medium text-cloud tracking-[-0.03em] leading-none font-data mt-3">
        {value}
      </p>
      {caption && (
        <p className="text-[11px] text-stone-dark mt-2 tracking-tight">
          {caption}
        </p>
      )}
    </div>
  )
}
