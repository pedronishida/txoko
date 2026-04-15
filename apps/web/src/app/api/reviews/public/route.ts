import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import type { ReviewSentiment } from '@txoko/shared'
import { createPublicClient } from '@/lib/supabase/public'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
        'Voce e um classificador de sentimento em portugues brasileiro. Responda APENAS com uma palavra: positive, neutral ou negative.',
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

type Body = {
  slug: string
  rating: number
  nps?: number | null
  comment?: string
  table_number?: number | null
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }

  if (!body.slug || !body.rating || body.rating < 1 || body.rating > 5) {
    return NextResponse.json(
      { error: 'slug e rating (1-5) sao obrigatorios' },
      { status: 400 }
    )
  }

  const supabase = createPublicClient()

  // Resolver restaurant por slug (RLS permite leitura anon de restaurantes ativos)
  const { data: restaurant, error: restError } = await supabase
    .from('restaurants')
    .select('id')
    .eq('slug', body.slug)
    .eq('is_active', true)
    .maybeSingle()

  if (restError || !restaurant) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 404 })
  }

  const comment = (body.comment ?? '').trim()
  const sentiment = comment
    ? await classifyWithClaude(comment, body.rating)
    : heuristicSentiment(body.rating)

  const { error: insertError } = await supabase.from('reviews').insert({
    restaurant_id: restaurant.id,
    rating: body.rating,
    nps: body.nps ?? null,
    comment: comment || null,
    sentiment,
    source: 'qrcode',
    is_anonymous: true,
  })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sentiment })
}
