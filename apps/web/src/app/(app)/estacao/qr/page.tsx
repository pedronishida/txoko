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

  // Margem 1 e correcao M: le bem impresso pequeno no cartao sem inflar o
  // desenho. SVG porque a grafica precisa de vetor.
  const qrSvg = await QRCode.toString(qrTarget, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
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
