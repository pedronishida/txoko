'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { MOCK_REVIEWS } from '@/lib/mock-reviews'
import type { ReviewSentiment } from '@txoko/shared'
import { Star, ThumbsUp, Minus, ThumbsDown, TrendingUp, MessageSquare, BarChart3 } from 'lucide-react'

type SentimentFilter = 'all' | ReviewSentiment

const SENTIMENT_CONFIG: Record<ReviewSentiment, { label: string; color: string; bg: string; icon: typeof ThumbsUp }> = {
  positive: { label: 'Positivo', color: 'text-leaf', bg: 'bg-leaf/10', icon: ThumbsUp },
  neutral: { label: 'Neutro', color: 'text-warm', bg: 'bg-warm/10', icon: Minus },
  negative: { label: 'Negativo', color: 'text-coral', bg: 'bg-coral/10', icon: ThumbsDown },
}

const SOURCE_LABELS: Record<string, string> = {
  internal: 'Txoko',
  google: 'Google',
  ifood: 'iFood',
}

export default function AvaliacoesPage() {
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all')

  const reviews = useMemo(() => {
    if (sentimentFilter === 'all') return MOCK_REVIEWS
    return MOCK_REVIEWS.filter(r => r.sentiment === sentimentFilter)
  }, [sentimentFilter])

  const stats = useMemo(() => {
    const avg = MOCK_REVIEWS.reduce((s, r) => s + r.rating, 0) / MOCK_REVIEWS.length
    const npsScores = MOCK_REVIEWS.filter(r => r.nps !== null).map(r => r.nps!)
    const promoters = npsScores.filter(n => n >= 9).length
    const detractors = npsScores.filter(n => n <= 6).length
    const nps = Math.round(((promoters - detractors) / npsScores.length) * 100)
    const sentiments = {
      positive: MOCK_REVIEWS.filter(r => r.sentiment === 'positive').length,
      neutral: MOCK_REVIEWS.filter(r => r.sentiment === 'neutral').length,
      negative: MOCK_REVIEWS.filter(r => r.sentiment === 'negative').length,
    }
    return { avg, nps, total: MOCK_REVIEWS.length, sentiments }
  }, [])

  const ratingDistribution = useMemo(() => {
    const dist = [0, 0, 0, 0, 0]
    MOCK_REVIEWS.forEach(r => { dist[r.rating - 1]++ })
    return dist
  }, [])

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <Star key={i} size={14} className={i < rating ? 'text-warm fill-warm' : 'text-night-lighter'} />
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
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-warm/10">
          <Star size={20} className="text-warm" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-cloud">Avaliacoes & NPS</h1>
          <p className="text-sm text-stone">Feedback dos clientes com analise de sentimento</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-leaf" /><span className="text-xs text-stone">NPS</span></div>
          <p className="text-3xl font-bold font-data text-leaf">{stats.nps}</p>
          <p className="text-[10px] text-stone mt-1">{stats.nps >= 70 ? 'Excelente' : stats.nps >= 50 ? 'Bom' : 'Precisa melhorar'}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><Star size={16} className="text-warm" /><span className="text-xs text-stone">Nota Media</span></div>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-bold font-data text-warm">{stats.avg.toFixed(1)}</p>
            <div className="flex">{renderStars(Math.round(stats.avg))}</div>
          </div>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><MessageSquare size={16} className="text-cloud" /><span className="text-xs text-stone">Total</span></div>
          <p className="text-3xl font-bold font-data text-cloud">{stats.total}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><ThumbsUp size={16} className="text-leaf" /><span className="text-xs text-stone">Sentimento</span></div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs font-data text-leaf">{Math.round((stats.sentiments.positive / stats.total) * 100)}% pos</span>
            <span className="text-xs font-data text-coral">{Math.round((stats.sentiments.negative / stats.total) * 100)}% neg</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Rating Distribution */}
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-stone-light" />
            <h2 className="text-sm font-semibold text-cloud">Distribuicao de Notas</h2>
          </div>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map(rating => {
              const count = ratingDistribution[rating - 1]
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              return (
                <div key={rating} className="flex items-center gap-2">
                  <span className="text-xs font-data text-cloud w-3">{rating}</span>
                  <Star size={12} className="text-warm fill-warm" />
                  <div className="flex-1 h-2 bg-night rounded-full overflow-hidden">
                    <div className="h-full bg-warm/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-data text-stone w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Review List */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            {(['all', 'positive', 'neutral', 'negative'] as const).map(s => {
              if (s === 'all') return (
                <button key={s} onClick={() => setSentimentFilter(s)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', sentimentFilter === s ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light border border-night-lighter')}>
                  Todos ({stats.total})
                </button>
              )
              const cfg = SENTIMENT_CONFIG[s]
              const count = stats.sentiments[s]
              return (
                <button key={s} onClick={() => setSentimentFilter(s)} className={cn('flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', sentimentFilter === s ? cfg.bg + ' ' + cfg.color : 'bg-night-light text-stone-light border border-night-lighter')}>
                  <cfg.icon size={12} />
                  {cfg.label} ({count})
                </button>
              )
            })}
          </div>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {reviews.map(review => {
              const sentCfg = review.sentiment ? SENTIMENT_CONFIG[review.sentiment] : null
              return (
                <div key={review.id} className="bg-night-light border border-night-lighter rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex">{renderStars(review.rating)}</div>
                      {review.nps !== null && (
                        <span className={cn('text-xs font-data px-1.5 py-0.5 rounded', review.nps >= 9 ? 'bg-leaf/10 text-leaf' : review.nps >= 7 ? 'bg-warm/10 text-warm' : 'bg-coral/10 text-coral')}>
                          NPS {review.nps}
                        </span>
                      )}
                      {sentCfg && (
                        <span className={cn('flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded', sentCfg.bg, sentCfg.color)}>
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
    </div>
  )
}
