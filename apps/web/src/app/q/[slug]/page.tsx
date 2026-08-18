import { redirect } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'

// Destino do QR impresso nas comandas.
//
// O QR e FIXO: aponta sempre pra ca. O link de destino fica em
// restaurants.settings.qr_url e e editavel no painel (Estacao > QR da
// comanda) — trocar a campanha nao exige reimprimir cartao nenhum.
//
// Sem destino configurado, cai no cardapio publico, que e o que o cliente
// mais espera ver num self-service.
export const dynamic = 'force-dynamic'

export default async function QrRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = createPublicClient()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug, settings')
    .eq('slug', slug)
    .maybeSingle()

  if (!restaurant) redirect('/')

  const settings = (restaurant.settings ?? {}) as Record<string, unknown>
  const destino = typeof settings.qr_url === 'string' ? settings.qr_url.trim() : ''

  redirect(destino || `/menu/${slug}`)
}
