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

export type ServiceMode = 'avontade' | 'por_kg' | 'por_kg_2mix'

export type StationCard = {
  id: string
  card_number: number
  // null = cartao generico; a modalidade e escolhida aqui na estacao
  service_mode: ServiceMode | null
}

export type StationSnapshot = {
  order_id: string
  status: string
  subtotal: number
  total: number
  // Modalidade efetiva da comanda (cai pro cartao nos cartoes legados).
  // null = ainda precisa perguntar.
  service_mode: ServiceMode | null
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

/**
 * Define a modalidade da comanda (tecla 1 / 2 / 3 na estacao).
 *
 * 'avontade' cobra preco fixo POR PESSOA — chamar de novo com outro numero
 * CORRIGE a quantidade em vez de lancar duas vezes.
 */
export async function setServiceMode(
  qrToken: string,
  mode: ServiceMode,
  people = 1
): Promise<StationSnapshot> {
  const { data, error } = await supabase.rpc('station_set_service_mode', {
    p_qr_token: qrToken,
    p_mode: mode,
    p_people: people,
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

export type ScanResolveResult =
  | { kind: 'customer'; session: StationSnapshot }
  | { kind: 'cancel'; restaurant_id: string; card_number: number }

export async function resolveScan(qrToken: string): Promise<ScanResolveResult> {
  const { data, error } = await supabase.rpc('station_resolve_scan', {
    p_qr_token: qrToken,
  })
  if (error) throw new Error(error.message)
  return data as ScanResolveResult
}

export async function cancelItem(
  cancelToken: string,
  orderId: string,
  itemId: string,
): Promise<StationSnapshot> {
  const { data, error } = await supabase.rpc('station_cancel_item', {
    p_cancel_token: cancelToken,
    p_order_id: orderId,
    p_item_id: itemId,
  })
  if (error) throw new Error(error.message)
  return data as StationSnapshot
}

export type BarcodeResolveResult =
  | { kind: 'customer'; qr_token: string; session: StationSnapshot }
  | { kind: 'cancel'; qr_token: string; restaurant_id: string; card_number: number }

/**
 * Abre a comanda pelo codigo de barras do cartao — o caminho normal da
 * operacao agora. Devolve tambem o qr_token porque as demais RPCs (peso,
 * barcode de produto, cancelamento) continuam recebendo token.
 */
export async function resolveBarcode(barcode: string): Promise<BarcodeResolveResult> {
  const { data, error } = await supabase.rpc('station_resolve_barcode', {
    p_barcode: barcode,
  })
  if (error) throw new Error(error.message)
  return data as BarcodeResolveResult
}
