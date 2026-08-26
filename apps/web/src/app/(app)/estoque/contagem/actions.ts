'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export type CountedProduct = {
  id: string
  name: string
  barcode: string | null
  /** Saldo antes da contagem. */
  before: number
  /** Saldo depois — igual ao que foi contado. */
  after: number
  /** Diferenca lancada como ajuste. Zero quando a contagem bateu. */
  diff: number
  /** Verdadeiro quando o controle foi ligado agora, nesta contagem. */
  enabledNow: boolean
}

/**
 * Conta um produto pelo codigo de barras.
 *
 * Uma chamada por bipada: resolve o codigo, liga o controle se ainda nao
 * estava ligado, calcula a diferenca contra o saldo atual e grava um ajuste.
 * O livro-razao nasce coerente com a prateleira, e nao com um numero digitado
 * do nada.
 */
export async function countByBarcode(barcode: string, counted: number) {
  const code = barcode.trim()
  if (!code) return { error: 'Codigo vazio' }
  if (!Number.isInteger(counted) || counted < 0) {
    return { error: 'A contagem precisa ser um numero inteiro, zero ou mais' }
  }

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: product, error: findError } = await supabase
    .from('products')
    .select('id, name, barcode, stock_tracked, stock_quantity, sold_by_weight, is_active')
    .eq('restaurant_id', restaurantId)
    .eq('barcode', code)
    .maybeSingle()

  if (findError) return { error: findError.message }
  if (!product) return { error: `Codigo ${code} nao esta em nenhum produto` }
  if (!product.is_active) return { error: `${product.name} esta inativo` }
  if (product.sold_by_weight) {
    return {
      error: `${product.name} e vendido por peso — ali o controle e de producao, nao de contagem`,
    }
  }

  // Quem esta contando um produto quer controla-lo. Bloquear aqui pra mandar
  // a pessoa ligar o controle em outra tela so quebraria o ritmo da contagem.
  const enabledNow = !product.stock_tracked
  if (enabledNow) {
    const { error } = await supabase
      .from('products')
      .update({ stock_tracked: true, stock_quantity: product.stock_quantity ?? 0 })
      .eq('id', product.id)
    if (error) return { error: error.message }
  }

  const before = product.stock_quantity ?? 0
  const diff = counted - before

  if (diff !== 0) {
    const { error } = await supabase.rpc('record_stock_movement', {
      p_product_id: product.id,
      p_kind: 'adjustment',
      p_quantity: diff,
      p_order_id: null,
      p_note: `Contagem: ${counted}`,
    })
    if (error) return { error: error.message }
  }

  revalidatePath('/estoque/produtos')
  revalidatePath('/estoque/contagem')
  revalidatePath('/pdv')

  return {
    ok: true as const,
    product: {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      before,
      after: counted,
      diff,
      enabledNow,
    } satisfies CountedProduct,
  }
}

/**
 * Liga o controle de estoque em lote, para todo produto de unidade que tem
 * codigo de barras.
 *
 * O codigo de barras e o corte certo: quem tem codigo foi comprado pronto e se
 * conta na prateleira. Bebida feita na casa — suco, caipirinha — nao tem
 * codigo e nao tem o que contar.
 *
 * O saldo comeca em zero de proposito: quem da o numero e a contagem, nao um
 * palpite no cadastro.
 */
export async function enableStockForBarcodedProducts() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data, error } = await supabase
    .from('products')
    .update({ stock_tracked: true, stock_quantity: 0 })
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .eq('sold_by_weight', false)
    .eq('stock_tracked', false)
    .not('barcode', 'is', null)
    .select('id')

  if (error) return { error: error.message }

  revalidatePath('/estoque/produtos')
  revalidatePath('/estoque/contagem')
  return { ok: true as const, count: (data ?? []).length }
}
