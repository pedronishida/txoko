'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

// Destino do QR impresso nas comandas. O QR aponta sempre pra /q/<slug>;
// o que muda e este valor — trocar campanha nao reimprime cartao.
const schema = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => v === '' || /^https?:\/\/.+\..+/.test(v),
      'Informe um link completo, comecando com https://'
    ),
})

export async function updateQrUrl(input: { url: string }) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Link invalido' }
  }

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: current } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .maybeSingle()

  const settings = {
    ...((current?.settings as Record<string, unknown>) ?? {}),
    qr_url: parsed.data.url,
  }

  const { error } = await supabase
    .from('restaurants')
    .update({ settings })
    .eq('id', restaurantId)

  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/estacao/qr')
  return { ok: true as const }
}
