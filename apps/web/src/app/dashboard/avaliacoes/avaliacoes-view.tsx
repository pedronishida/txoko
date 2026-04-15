'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Customer, Review, ReviewSentiment } from '@txoko/shared'
import {
  BarChart3,
  MessageSquare,
  Minus,
  Plus,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  X,
} from 'lucide-react'
import { createReview } from './actions'

type SentimentFilter = 'all' | ReviewSentiment

const SENTIMENT_CONFIG: Record<
  ReviewSentiment,
  { label: string; color: string; bg: string; icon: typeof ThumbsUp }
> = {
  positive: { label: 'Positivo', color: 'text-leaf', bg: 'bg-leaf/10', icon: ThumbsUp },
  neutral: { label: 'Neutro', color: 'text-warm', bg: 'bg-warm/10', icon: Minus },
  negative: { label: 'Negativo', color: 'text-coral', bg: 'bg-coral/10', icon: ThumbsDown },
}

const SOURCE_LABELS: Record<string, string> = {
  internal: 'Txoko',
  google: 'Google',
  ifood: 'iFood',
  qrcode: 'QR Code',
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
    const avg = reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length
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

  function renderStars(rating: number, size = 14) {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        size={size}
        className={i < rating ? 'text-warm fill-warm' : 'text-stone/30'}
      />
    ))
  }

  function formatDate(d: string) {
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
    if (days === 0) return 'Hoje'
    if (days === 1) return 'Ontem'
    return `${days} dias atras`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-warm/10">
            <Star size={20} className="text-warm" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cloud">Avaliacoes & NPS</h1>
            <p className="text-sm text-stone flex items-center gap-1">
              <Sparkles size={12} className="text-leaf" />
              Sentimento classificado automaticamente pelo Claude
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setError(null)
            setShowForm(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} /> Nova Avaliacao
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-leaf" />
            <span className="text-xs text-stone">NPS</span>
          </div>
          <p className="text-3xl font-bold font-data text-leaf">{stats.nps}</p>
          <p className="text-[10px] text-stone mt-1">
            {stats.nps >= 70 ? 'Excelente' : stats.nps >= 50 ? 'Bom' : 'Precisa melhorar'}
          </p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star size={16} className="text-warm" />
            <span className="text-xs text-stone">Nota Media</span>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-bold font-data text-warm">{stats.avg.toFixed(1)}</p>
            <div className="flex">{renderStars(Math.round(stats.avg))}</div>
          </div>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={16} className="text-cloud" />
            <span className="text-xs text-stone">Total</span>
          </div>
          <p className="text-3xl font-bold font-data text-cloud">{stats.total}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <ThumbsUp size={16} className="text-leaf" />
            <span className="text-xs text-stone">Sentimento</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs font-data text-leaf">
              {stats.total > 0 ? Math.round((stats.sentiments.positive / stats.total) * 100) : 0}% pos
            </span>
            <span className="text-xs font-data text-coral">
              {stats.total > 0 ? Math.round((stats.sentiments.negative / stats.total) * 100) : 0}% neg
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-stone-light" />
            <h2 className="text-sm font-semibold text-cloud">Distribuicao de Notas</h2>
          </div>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = ratingDistribution[rating - 1]
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              return (
                <div key={rating} className="flex items-center gap-2">
                  <span className="text-xs font-data text-cloud w-3">{rating}</span>
                  <Star size={12} className="text-warm fill-warm" />
                  <div className="flex-1 h-2 bg-night rounded-full overflow-hidden">
                    <div
                      className="h-full bg-warm/60 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-data text-stone w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            {(['all', 'positive', 'neutral', 'negative'] as const).map((s) => {
              if (s === 'all')
                return (
                  <button
                    key={s}
                    onClick={() => setSentimentFilter(s)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      sentimentFilter === s
                        ? 'bg-primary/10 text-primary'
                        : 'bg-night-light text-stone-light border border-night-lighter'
                    )}
                  >
                    Todos ({stats.total})
                  </button>
                )
              const cfg = SENTIMENT_CONFIG[s]
              const count = stats.sentiments[s]
              return (
                <button
                  key={s}
                  onClick={() => setSentimentFilter(s)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    sentimentFilter === s
                      ? cfg.bg + ' ' + cfg.color
                      : 'bg-night-light text-stone-light border border-night-lighter'
                  )}
                >
                  <cfg.icon size={12} />
                  {cfg.label} ({count})
                </button>
              )
            })}
          </div>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="bg-night-light border border-night-lighter rounded-xl p-8 text-center text-sm text-stone">
                Nenhuma avaliacao ainda. Clique em &ldquo;Nova Avaliacao&rdquo; para criar.
              </div>
            )}
            {filtered.map((review) => {
              const sentCfg = review.sentiment ? SENTIMENT_CONFIG[review.sentiment] : null
              return (
                <div
                  key={review.id}
                  className="bg-night-light border border-night-lighter rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex">{renderStars(Number(review.rating))}</div>
                      {review.nps !== null && review.nps !== undefined && (
                        <span
                          className={cn(
                            'text-xs font-data px-1.5 py-0.5 rounded',
                            review.nps >= 9
                              ? 'bg-primary/10 text-primary'
                              : review.nps >= 7
                              ? 'bg-warm/10 text-warm'
                              : 'bg-coral/10 text-coral'
                          )}
                        >
                          NPS {review.nps}
                        </span>
                      )}
                      {sentCfg && (
                        <span
                          className={cn(
                            'flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded',
                            sentCfg.bg,
                            sentCfg.color
                          )}
                        >
                          <sentCfg.icon size={10} />
                          {sentCfg.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-stone">
                      <span>{SOURCE_LABELS[review.source] || review.source}</span>
                      <span className="font-data">{formatDate(review.created_at)}</span>
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-stone-light">{review.comment}</p>
                  )}
                  {review.is_anonymous && (
                    <p className="text-[10px] text-stone mt-1">Anonimo</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
              <h2 className="font-semibold text-cloud">Nova Avaliacao</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-stone hover:text-cloud">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {error && (
                <div className="px-3 py-2 bg-coral/10 border border-coral/30 rounded-lg text-xs text-coral">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm text-stone-light mb-1">Nota</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setFormRating(n)}
                      className="p-1"
                    >
                      <Star
                        size={24}
                        className={n <= formRating ? 'text-warm fill-warm' : 'text-stone/30'}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-stone-light mb-1">
                  NPS (0-10, opcional)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={formNps}
                  onChange={(e) => setFormNps(e.target.value)}
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm text-stone-light mb-1">Comentario</label>
                <textarea
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  rows={3}
                  placeholder="O que o cliente achou?"
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                />
                <p className="text-[10px] text-stone mt-1 flex items-center gap-1">
                  <Sparkles size={10} className="text-leaf" />
                  O sentimento sera classificado automaticamente pelo Claude
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-stone-light cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formAnonymous}
                    onChange={(e) => setFormAnonymous(e.target.checked)}
                    className="rounded"
                  />
                  Anonima
                </label>
                {!formAnonymous && (
                  <select
                    value={formCustomerId}
                    onChange={(e) => setFormCustomerId(e.target.value)}
                    className="flex-1 px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
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
                  className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm text-stone-light hover:text-cloud transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {pending ? 'Classificando...' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
