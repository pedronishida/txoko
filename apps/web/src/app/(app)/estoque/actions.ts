'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

function revalidateEstoque() {
  revalidatePath('/estoque')
  revalidatePath('/estoque/fornecedores')
  revalidatePath('/estoque/fichas')
}

// -------- INGREDIENTS --------
export type IngredientInput = {
  id?: string
  name: string
  unit: string
  current_stock: number
  min_stock: number
  cost_per_unit: number | null
  supplier_id: string | null
  storage_location: string | null
}

export async function saveIngredient(input: IngredientInput) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const payload = {
    restaurant_id,
    name: input.name,
    unit: input.unit,
    current_stock: input.current_stock,
    min_stock: input.min_stock,
    cost_per_unit: input.cost_per_unit,
    supplier_id: input.supplier_id,
    storage_location: input.storage_location,
  }
  const { error } = input.id
    ? await supabase.from('ingredients').update(payload).eq('id', input.id)
    : await supabase.from('ingredients').insert(payload)
  if (error) return { error: error.message }
  revalidateEstoque()
  return { ok: true }
}

export async function deleteIngredient(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('ingredients').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateEstoque()
  return { ok: true }
}

// -------- SUPPLIERS --------
export type SupplierInput = {
  id?: string
  name: string
  document: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

export async function saveSupplier(input: SupplierInput) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const payload = {
    restaurant_id,
    name: input.name,
    document: input.document,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
  }
  const { error } = input.id
    ? await supabase.from('suppliers').update(payload).eq('id', input.id)
    : await supabase.from('suppliers').insert(payload)
  if (error) return { error: error.message }
  revalidateEstoque()
  return { ok: true }
}

export async function deleteSupplier(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateEstoque()
  return { ok: true }
}

// -------- RECIPES (fichas tecnicas) --------
export type RecipeItemInput = {
  ingredient_id: string
  quantity: number
}

export async function saveRecipe(product_id: string, items: RecipeItemInput[]) {
  const supabase = await createClient()

  // Apaga fichas atuais desse produto e reescreve
  const { error: delError } = await supabase
    .from('product_recipes')
    .delete()
    .eq('product_id', product_id)
  if (delError) return { error: delError.message }

  if (items.length === 0) {
    revalidateEstoque()
    return { ok: true }
  }

  const payload = items.map((it) => ({
    product_id,
    ingredient_id: it.ingredient_id,
    quantity: it.quantity,
  }))
  const { error } = await supabase.from('product_recipes').insert(payload)
  if (error) return { error: error.message }
  revalidateEstoque()
  return { ok: true }
}
