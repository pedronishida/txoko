import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { PublicBookingForm } from './booking-form'

export const dynamic = 'force-dynamic'

export default async function ReservarPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = createPublicClient()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!restaurant) notFound()

  return (
    <PublicBookingForm
      restaurantName={restaurant.name as string}
      slug={restaurant.slug as string}
    />
  )
}
