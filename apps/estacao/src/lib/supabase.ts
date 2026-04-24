import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Cliente publico (anon) — SPA estatica bate direto nas RPCs.
// As RPCs sao SECURITY DEFINER e validam via qr_token, nao dependem de auth.uid().
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Estacao nao autentica usuario, nao precisa sessao
    persistSession: false,
    autoRefreshToken: false,
  },
})

export type StationItem = {
  id: string
  product_id: string
  product_name: string
  quantity: number
  weight_grams: number | null
  unit_price: number
  total_price: number
  created_at: string
}

export type StationCard = {
  id: string
  card_number: number
  service_mode: 'avontade' | 'por_kg'
}

export type StationSnapshot = {
  order_id: string
  status: string
  subtotal: number
  total: number
  comanda_card: StationCard
  items: StationItem[]
}

export async function openSession(qrToken: string): Promise<StationSnapshot> {
  const { data, error } = await supabase.rpc('station_open_session', {
    p_qr_token: qrToken,
  })
  if (error) throw new Error(error.message)
  return data as StationSnapshot
}

export async function addWeightItem(qrToken: string, weightGrams: number): Promise<StationSnapshot> {
  const { data, error } = await supabase.rpc('station_add_weight_item', {
    p_qr_token: qrToken,
    p_weight_grams: weightGrams,
  })
  if (error) throw new Error(error.message)
  return data as StationSnapshot
}

export async function addBarcodeItem(qrToken: string, barcode: string): Promise<StationSnapshot> {
  const { data, error } = await supabase.rpc('station_add_barcode_item', {
    p_qr_token: qrToken,
    p_barcode: barcode,
  })
  if (error) throw new Error(error.message)
  return data as StationSnapshot
}
