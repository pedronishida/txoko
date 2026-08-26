'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type MovementKind = 'purchase' | 'adjustment' | 'loss'

export type StockMovement = {
  id: string
  kind: string
  quantity: number
  balance_after: number
  note: string | null
  order_id: string | null
  at: string
}

function revalidateProdutos() {
  revalidatePath('/estoque/produtos')
  revalidatePath('/pdv')
  revalidatePath('/cardapio')
}

/**
 * Liga ou desliga o controle de estoque de um produto, e define o minimo.
 *
 * Ao ligar, o saldo comeca em zero e sobe por movimento — nao por edicao
 * direta do campo. E o que faz o livro-razao bater com o saldo.
 */
export async function setProductStockControl(input: {
  productId: string
  tracked: boolean
  min: number | null
}) {
  const supabase = await createClient()

  const patch: Record<string, unknown> = {
    stock_tracked: input.tracked,
    stock_min: input.tracked ? input.min : null,
  }
  if (input.tracked) {
    const { data: current } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', input.productId)
      .maybeSingle()
    if (current?.stock_quantity == null) patch.stock_quantity = 0
  }

  const { error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', input.productId)
  if (error) return { error: error.message }

  revalidateProdutos()
  return { ok: true as const }
}

/**
 * Lanca um movimento de estoque.
 *
 * Entrada de compra, ajuste de inventario e perda passam por aqui; a baixa de
 * venda e a devolucao de cancelamento sao do gatilho no banco. Todo caminho
 * termina em record_stock_movement, que e quem trava a linha do produto e
 * mantem saldo e livro em acordo.
 */
export async function recordMovement(input: {
  productId: string
  kind: MovementKind
  /** Sempre positiva. O sinal sai do tipo do movimento. */
  quantity: number
  note?: string | null
}) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { error: 'Informe uma quantidade inteira maior que zero' }
  }

  // Perda tira; compra poe; ajuste e a diferenca informada pelo operador e
  // pode ir nos dois sentidos, entao chega ja assinada do formulario.
  const signed = input.kind === 'loss' ? -input.quantity : input.quantity

  const supabase = await createClient()
  const { error } = await supabase.rpc('record_stock_movement', {
    p_product_id: input.productId,
    p_kind: input.kind,
    p_quantity: signed,
    p_order_id: null,
    p_note: input.note ?? null,
  })
  if (error) return { error: error.message }

  revalidateProdutos()
  return { ok: true as const }
}

/** Ajuste de inventario: informa o saldo contado, o sistema calcula a diferenca. */
export async function adjustToCount(input: {
  productId: string
  counted: number
  note?: string | null
}) {
  if (!Number.isInteger(input.counted) || input.counted < 0) {
    return { error: 'Informe um saldo contado inteiro e nao negativo' }
  }

  const supabase = await createClient()
  const { data: product, error: readError } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', input.productId)
    .maybeSingle()
  if (readError) return { error: readError.message }

  const diff = input.counted - (product?.stock_quantity ?? 0)
  if (diff === 0) return { ok: true as const, unchanged: true }

  const { error } = await supabase.rpc('record_stock_movement', {
    p_product_id: input.productId,
    p_kind: 'adjustment',
    p_quantity: diff,
    p_order_id: null,
    p_note: input.note ?? `Contagem: ${input.counted}`,
  })
  if (error) return { error: error.message }

  revalidateProdutos()
  return { ok: true as const }
}

/** Livro-razao de um produto, do mais recente pro mais antigo. */
export async function listMovements(productId: string): Promise<StockMovement[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stock_movements')
    .select('id, kind, quantity, balance_after, note, order_id, at')
    .eq('product_id', productId)
    .order('at', { ascending: false })
    .limit(50)
  if (error) return []
  return (data ?? []) as StockMovement[]
}
