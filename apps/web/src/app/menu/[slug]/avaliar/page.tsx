import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { AvaliarForm } from './avaliar-form'

export const dynamic = 'force-dynamic'

export default async function AvaliarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ mesa?: string }>
}) {
  const { slug } = await params
  const { mesa } = await searchParams

  const supabase = createPublicClient()
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!restaurant) notFound()

  return (
    <AvaliarForm
      slug={restaurant.slug as string}
      restaurantName={restaurant.name as string}
      tableNumber={mesa ? Number(mesa) : null}
    />
  )
}
