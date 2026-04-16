'use server'

import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import type { ReviewSentiment } from '@txoko/shared'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

// Fallback heuristico quando ANTHROPIC_API_KEY nao esta configurado
function heuristicSentiment(rating: number): ReviewSentiment {
  if (rating >= 4) return 'positive'
  if (rating === 3) return 'neutral'
  return 'negative'
}

async function classifyWithClaude(
  comment: string,
  rating: number
): Promise<ReviewSentiment> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return heuristicSentiment(rating)

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 20,
      system:
        'Voce e um classificador de sentimento em portugues brasileiro. Responda APENAS com uma palavra: positive, neutral ou negative. Nao adicione pontuacao, explicacao ou outras palavras.',
      messages: [
        {
          role: 'user',
          content: `Avaliacao ${rating}/5 estrelas. Comentario: "${comment}"\n\nSentimento:`,
        },
      ],
    })
    const block = response.content.find((b) => b.type === 'text')
    const raw = block && block.type === 'text' ? block.text.trim().toLowerCase() : ''
    if (raw.startsWith('positive')) return 'positive'
    if (raw.startsWith('negative')) return 'negative'
    if (raw.startsWith('neutral')) return 'neutral'
    return heuristicSentiment(rating)
  } catch {
    return heuristicSentiment(rating)
  }
}

export type NewReviewInput = {
  rating: number
  nps: number | null
  comment: string
  customer_id: string | null
  is_anonymous: boolean
  source: string
}

export async function createReview(input: NewReviewInput) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  let sentiment: ReviewSentiment | null = null
  if (input.comment.trim().length > 0) {
    sentiment = await classifyWithClaude(input.comment.trim(), input.rating)
  } else {
    sentiment = heuristicSentiment(input.rating)
  }

  const { error } = await supabase.from('reviews').insert({
    restaurant_id,
    rating: input.rating,
    nps: input.nps,
    comment: input.comment.trim() || null,
    customer_id: input.customer_id,
    is_anonymous: input.is_anonymous,
    source: input.source,
    sentiment,
  })
  if (error) return { error: error.message }
  revalidatePath('/avaliacoes')
  return { ok: true, sentiment }
}

export async function reclassifyReview(id: string) {
  const supabase = await createClient()
  const { data: review, error } = await supabase
    .from('reviews')
    .select('id, rating, comment')
    .eq('id', id)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!review) return { error: 'Avaliacao nao encontrada' }

  const sentiment = review.comment
    ? await classifyWithClaude(review.comment as string, review.rating as number)
    : heuristicSentiment(review.rating as number)

  const { error: upError } = await supabase
    .from('reviews')
    .update({ sentiment })
    .eq('id', id)
  if (upError) return { error: upError.message }
  revalidatePath('/avaliacoes')
  return { ok: true, sentiment }
}
