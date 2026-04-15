import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { MenuPageContent } from '@/components/menu/menu-page-content'
import type { Category, Product, Review } from '@txoko/shared'

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('restaurants')
    .select('slug')
    .eq('is_active', true)
  return (data ?? []).map((r) => ({ slug: r.slug as string }))
}

export default async function MenuPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!restaurant) notFound()

  const [{ data: categories }, { data: products }, { data: reviews }] =
    await Promise.all([
      supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('products')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('reviews')
        .select('id, rating, comment, sentiment, created_at')
        .eq('restaurant_id', restaurant.id)
        .not('comment', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

  return (
    <MenuPageContent
      restaurantName={restaurant.name as string}
      slug={restaurant.slug as string}
      categories={(categories ?? []) as unknown as Category[]}
      products={(products ?? []) as unknown as Product[]}
      reviews={
        (reviews ?? []) as unknown as Pick<
          Review,
          'id' | 'rating' | 'comment' | 'sentiment' | 'created_at'
        >[]
      }
    />
  )
}
