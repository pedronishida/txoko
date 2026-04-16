'use server'

import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

export type SignupState =
  | { error: string; step?: number }
  | { success: true; userId: string; restaurantId: string }
  | null

const signupSchema = z.object({
  full_name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  email: z.string().email('E-mail invalido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
  terms: z.literal('on', { error: 'Voce deve aceitar os termos' }),
  restaurant_name: z.string().min(2, 'Nome do restaurante deve ter ao menos 2 caracteres'),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  restaurant_type: z.string().min(1, 'Selecione o tipo de estabelecimento'),
})

type RestaurantType =
  | 'restaurante'
  | 'bar'
  | 'pizzaria'
  | 'lanchonete'
  | 'cafeteria'
  | 'outro'

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function ensureUniqueSlug(
  service: ReturnType<typeof createServiceClient>,
  base: string
): Promise<string> {
  let slug = base
  let attempt = 0
  while (attempt < 20) {
    const { data } = await service
      .from('restaurants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return slug
    attempt++
    slug = `${base}-${attempt}`
  }
  return `${base}-${Date.now()}`
}

export async function completeSignupAction(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const raw = {
    full_name: String(formData.get('full_name') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    terms: String(formData.get('terms') ?? ''),
    restaurant_name: String(formData.get('restaurant_name') ?? ''),
    cnpj: String(formData.get('cnpj') ?? '') || undefined,
    phone: String(formData.get('phone') ?? '') || undefined,
    restaurant_type: String(formData.get('restaurant_type') ?? ''),
  }

  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first.message }
  }

  const data = parsed.data
  const service = createServiceClient()

  // 1. Create auth user via service role (bypasses email confirm for first session)
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email: data.email,
    password: data.password,
    user_metadata: { full_name: data.full_name },
    email_confirm: true, // skip email confirm for onboarding UX
  })

  if (authError) {
    if (authError.message.toLowerCase().includes('already registered') || authError.code === 'email_exists') {
      return { error: 'Este e-mail ja esta cadastrado. Tente fazer login.' }
    }
    return { error: authError.message }
  }

  const userId = authData.user.id

  // 2. Create restaurant record
  const baseSlug = generateSlug(data.restaurant_name)
  const slug = await ensureUniqueSlug(service, baseSlug)

  const { data: restaurant, error: restaurantError } = await service
    .from('restaurants')
    .insert({
      name: data.restaurant_name,
      slug,
      type: data.restaurant_type as RestaurantType,
      cnpj: data.cnpj ?? null,
      phone: data.phone ?? null,
      owner_id: userId,
    })
    .select('id')
    .single()

  if (restaurantError) {
    // Rollback: delete the user we just created
    await service.auth.admin.deleteUser(userId)
    return { error: 'Erro ao criar restaurante. Tente novamente.' }
  }

  const restaurantId = restaurant.id

  // 3. Create restaurant_member link (owner role)
  const { error: memberError } = await service
    .from('restaurant_members')
    .insert({
      restaurant_id: restaurantId,
      user_id: userId,
      role: 'owner',
    })

  if (memberError) {
    // Non-fatal: user + restaurant created, membership may already exist
    console.error('member insert error:', memberError.message)
  }

  // 4. Sign in the user to establish a session
  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  })

  if (signInError) {
    // Account was created; redirect to login with success message
    redirect('/login?created=1')
  }

  redirect('/onboarding')
}
