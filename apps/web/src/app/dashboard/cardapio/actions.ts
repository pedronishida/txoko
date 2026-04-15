'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export async function uploadProductImage(formData: FormData) {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'Nenhum arquivo' }
  if (file.size > 5 * 1024 * 1024) return { error: 'Arquivo maior que 5MB' }

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
  const fileName = `${restaurantId}/${crypto.randomUUID()}.${safeExt}`

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { upsert: false, contentType: file.type })

  if (uploadError) return { error: uploadError.message }

  const { data: publicUrl } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName)

  return { ok: true, url: publicUrl.publicUrl }
}

export async function updateProductImage(productId: string, imageUrl: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ image_url: imageUrl })
    .eq('id', productId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/cardapio')
  return { ok: true }
}

export type ProductInput = {
  id?: string
  name: string
  description: string | null
  price: number
  cost: number | null
  category_id: string
  prep_time_minutes: number | null
  allergens: string[]
  tags: string[]
  is_active: boolean
  sort_order: number
  image_url: string | null
}

export async function saveProduct(input: ProductInput) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const payload = {
    restaurant_id,
    name: input.name,
    description: input.description,
    price: input.price,
    cost: input.cost,
    category_id: input.category_id,
    prep_time_minutes: input.prep_time_minutes,
    allergens: input.allergens,
    tags: input.tags,
    is_active: input.is_active,
    sort_order: input.sort_order,
    image_url: input.image_url,
  }

  const { error } = input.id
    ? await supabase.from('products').update(payload).eq('id', input.id)
    : await supabase.from('products').insert(payload)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/cardapio')
  return { ok: true }
}

export async function toggleProductActive(id: string, is_active: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ is_active })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/cardapio')
  return { ok: true }
}

export async function createCategory(name: string) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const { error } = await supabase
    .from('categories')
    .insert({ restaurant_id, name })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/cardapio')
  return { ok: true }
}
