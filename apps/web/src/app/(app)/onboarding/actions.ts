'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { z } from 'zod'

export type OnboardingState = { error: string } | null

// ─────────────────────────────────────────────────
// Step 1: Restaurant details
// ─────────────────────────────────────────────────

const restaurantDetailsSchema = z.object({
  address: z.string().optional(),
  service_charge: z.coerce.number().min(0).max(100).optional(),
  opening_time: z.string().optional(),
  closing_time: z.string().optional(),
})

export async function saveRestaurantDetailsAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const raw = {
    address: String(formData.get('address') ?? '') || undefined,
    service_charge: formData.get('service_charge')
      ? Number(formData.get('service_charge'))
      : undefined,
    opening_time: String(formData.get('opening_time') ?? '') || undefined,
    closing_time: String(formData.get('closing_time') ?? '') || undefined,
  }

  const parsed = restaurantDetailsSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const updates: Record<string, unknown> = {}
  if (parsed.data.address) updates.address = parsed.data.address
  if (parsed.data.service_charge !== undefined)
    updates.service_charge = parsed.data.service_charge
  if (parsed.data.opening_time || parsed.data.closing_time) {
    const hours: Record<string, string> = {}
    if (parsed.data.opening_time) hours.open = parsed.data.opening_time
    if (parsed.data.closing_time) hours.close = parsed.data.closing_time
    updates.business_hours = hours
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('restaurants')
      .update(updates)
      .eq('id', restaurantId)

    if (error) return { error: error.message }
  }

  revalidatePath('/home')
  return null
}

// ─────────────────────────────────────────────────
// Step 2: First products
// ─────────────────────────────────────────────────

const productsSchema = z.array(
  z.object({
    name: z.string().min(1),
    price: z.coerce.number().min(0),
  })
)

export async function saveProductsAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  // Parse repeating name[]/price[] fields
  const names = formData.getAll('product_name').map(String)
  const prices = formData.getAll('product_price').map(String)

  const items = names
    .map((name, i) => ({ name: name.trim(), price: Number(prices[i] ?? 0) }))
    .filter((p) => p.name.length > 0 && p.price > 0)

  const parsed = productsSchema.safeParse(items)
  if (!parsed.success) {
    return { error: 'Verifique os nomes e precos dos produtos' }
  }

  if (parsed.data.length > 0) {
    const rows = parsed.data.map((p) => ({
      restaurant_id: restaurantId,
      name: p.name,
      price: p.price,
      category: 'Geral',
      active: true,
    }))

    const { error } = await supabase.from('menu_items').insert(rows)
    if (error) return { error: error.message }
  }

  revalidatePath('/cardapio')
  return null
}

// ─────────────────────────────────────────────────
// Step 3: Invite staff
// ─────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['garcom', 'cozinha', 'caixa', 'gerente']),
})

export async function inviteStaffAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const emails = formData.getAll('invite_email').map(String).filter((e) => e.trim())
  const roles = formData.getAll('invite_role').map(String)

  if (emails.length === 0) return null

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i].trim()
    const role = roles[i] || 'garcom'

    const parsed = inviteSchema.safeParse({ email, role })
    if (!parsed.success) continue

    // Insert a pending invite record
    await supabase.from('staff_invites').insert({
      restaurant_id: restaurantId,
      email: parsed.data.email,
      role: parsed.data.role,
      status: 'pending',
    })
  }

  return null
}

// ─────────────────────────────────────────────────
// Mark onboarding complete
// ─────────────────────────────────────────────────

export async function completeOnboardingAction() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  await supabase
    .from('restaurants')
    .update({ onboarding_completed: true })
    .eq('id', restaurantId)

  revalidatePath('/', 'layout')
  redirect('/home')
}
