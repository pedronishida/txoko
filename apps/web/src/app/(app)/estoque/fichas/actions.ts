'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

function revalidateFichas() {
  revalidatePath('/estoque')
  revalidatePath('/estoque/fichas')
}

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export type RecipeIngredientInput = {
  ingredient_id: string
  quantity: number
  unit: string
  waste_percent: number
  notes: string | null
  sort_order: number
}

export type RecipeInput = {
  product_id: string
  yield_quantity: number
  yield_unit: string
  prep_time_minutes: number | null
  instructions: string | null
  ingredients: RecipeIngredientInput[]
}

export type RecipeIngredientRow = {
  id: string
  product_id: string
  ingredient_id: string
  quantity: number
  unit: string
  waste_percent: number
  notes: string | null
  sort_order: number
}

export type RecipeMetadataRow = {
  id: string
  restaurant_id: string
  product_id: string
  yield_quantity: number
  yield_unit: string
  prep_time_minutes: number | null
  instructions: string | null
  created_at: string
  updated_at: string
}

export type RecipeFull = RecipeMetadataRow & {
  ingredients: RecipeIngredientRow[]
}

// ----------------------------------------------------------------
// listRecipes
// Returns all products with optional recipe data for the tenant.
// ----------------------------------------------------------------
export async function listRecipes() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: products }, { data: metadata }, { data: ingredients }, { data: recipeIngredients }] =
    await Promise.all([
      supabase
        .from('products')
        .select('id, name, price, category_id')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('recipe_metadata')
        .select('*')
        .eq('restaurant_id', restaurantId),
      supabase
        .from('ingredients')
        .select('id, name, unit, cost_per_unit, current_stock')
        .eq('restaurant_id', restaurantId)
        .order('name'),
      supabase
        .from('recipe_ingredients')
        .select('*')
        .order('sort_order'),
    ])

  return {
    products: products ?? [],
    metadata: metadata ?? [],
    ingredients: ingredients ?? [],
    recipeIngredients: recipeIngredients ?? [],
  }
}

// ----------------------------------------------------------------
// getRecipe — full recipe for a single product_id
// ----------------------------------------------------------------
export async function getRecipe(productId: string): Promise<RecipeFull | null> {
  const supabase = await createClient()

  const [{ data: meta }, { data: items }] = await Promise.all([
    supabase
      .from('recipe_metadata')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle(),
    supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order'),
  ])

  if (!meta) return null
  return { ...(meta as RecipeMetadataRow), ingredients: (items ?? []) as RecipeIngredientRow[] }
}

// ----------------------------------------------------------------
// saveRecipe — upsert metadata + replace all ingredients
// ----------------------------------------------------------------
export async function saveRecipe(input: RecipeInput) {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  // Upsert metadata
  const { error: metaError } = await supabase
    .from('recipe_metadata')
    .upsert(
      {
        restaurant_id: restaurantId,
        product_id: input.product_id,
        yield_quantity: input.yield_quantity,
        yield_unit: input.yield_unit,
        prep_time_minutes: input.prep_time_minutes,
        instructions: input.instructions,
      },
      { onConflict: 'product_id' }
    )
  if (metaError) return { error: metaError.message }

  // Delete existing ingredient rows for this product
  const { error: delError } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('product_id', input.product_id)
  if (delError) return { error: delError.message }

  // Insert new rows (skip empty)
  const validRows = input.ingredients.filter(
    (r) => r.ingredient_id && r.quantity > 0
  )
  if (validRows.length > 0) {
    const rows = validRows.map((r, i) => ({
      product_id: input.product_id,
      ingredient_id: r.ingredient_id,
      quantity: r.quantity,
      unit: r.unit,
      waste_percent: r.waste_percent ?? 0,
      notes: r.notes ?? null,
      sort_order: r.sort_order ?? i,
    }))
    const { error: insError } = await supabase.from('recipe_ingredients').insert(rows)
    if (insError) return { error: insError.message }
  }

  // Keep legacy product_recipes in sync for the stock trigger
  await supabase.from('product_recipes').delete().eq('product_id', input.product_id)
  if (validRows.length > 0) {
    // Convert recipe_ingredients quantities back to base-unit for the trigger
    // The trigger now uses recipe_ingredients directly, so this is just for legacy compat
    await supabase.from('product_recipes').insert(
      validRows.map((r) => ({
        product_id: input.product_id,
        ingredient_id: r.ingredient_id,
        quantity: r.quantity * (1 + (r.waste_percent ?? 0) / 100),
      }))
    )
  }

  revalidateFichas()
  return { ok: true }
}

// ----------------------------------------------------------------
// deleteRecipe — removes metadata + ingredients
// ----------------------------------------------------------------
export async function deleteRecipe(productId: string) {
  const supabase = await createClient()

  // recipe_ingredients and recipe_metadata will cascade via product delete,
  // but here we delete explicitly to avoid touching product itself.
  await supabase.from('recipe_ingredients').delete().eq('product_id', productId)
  await supabase.from('product_recipes').delete().eq('product_id', productId)
  const { error } = await supabase
    .from('recipe_metadata')
    .delete()
    .eq('product_id', productId)
  if (error) return { error: error.message }

  revalidateFichas()
  return { ok: true }
}

// ----------------------------------------------------------------
// computeRecipeCost — calls the SQL function
// ----------------------------------------------------------------
export async function computeRecipeCost(productId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('compute_recipe_cost', {
    p_product_id: productId,
  })
  if (error) return 0
  return Number(data ?? 0)
}
