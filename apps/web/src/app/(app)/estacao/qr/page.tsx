import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { QrConfigView } from './qr-config-view'

export const dynamic = 'force-dynamic'

export default async function EstacaoQrPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug, settings')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) {
    return (
      <p className="text-sm text-muted">
        Voce ainda nao esta vinculado a nenhum restaurante.
      </p>
    )
  }

  const settings = (restaurant.settings ?? {}) as Record<string, unknown>
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.txoko.com.br'
  const qrTarget = base + '/q/' + restaurant.slug

  // Margem 4: e a quiet zone que a norma do QR exige. Com menos que isso a
  // arte do cartao encosta no simbolo e o leitor perde o enquadramento.
  //
  // Correcao Q (25%) em vez de M (15%): pra uma URL deste tamanho as duas
  // caem na mesma matriz 29x29, entao Q e robustez de graca — e o cartao vive
  // num restaurante, pegando gordura, dobra e risco.
  //
  // SVG porque a grafica precisa de vetor.
  const qrSvg = await QRCode.toString(qrTarget, {
    type: 'svg',
    margin: 4,
    errorCorrectionLevel: 'Q',
  })

  return (
    <QrConfigView
      qrTarget={qrTarget}
      qrSvg={qrSvg}
      menuUrl={`${base}/menu/${restaurant.slug}`}
      initialUrl={typeof settings.qr_url === 'string' ? settings.qr_url : ''}
    />
  )
}
