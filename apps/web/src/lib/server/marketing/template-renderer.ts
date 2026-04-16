import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// Marketing — Template Renderer
// =============================================================
// Substitui variaveis ({name}, {loyalty_points}, etc.) em templates
// usando dados reais do customer + restaurante.
// =============================================================

export type TemplateContext = {
  customer: {
    name: string
    phone?: string | null
    email?: string | null
    loyalty_points?: number
    birthday?: string | null
  }
  restaurant: {
    name: string
    phone?: string | null
  }
  extras?: Record<string, string>
}

const VARIABLE_REGEX = /\{(\w+)\}/g

export function renderTemplate(
  template: string,
  ctx: TemplateContext
): string {
  return template.replace(VARIABLE_REGEX, (match, key: string) => {
    switch (key) {
      case 'name':
      case 'contact_name':
      case 'customer_name':
        return ctx.customer.name || 'Cliente'
      case 'first_name':
        return ctx.customer.name?.split(' ')[0] ?? 'Cliente'
      case 'phone':
        return ctx.customer.phone ?? ''
      case 'email':
        return ctx.customer.email ?? ''
      case 'loyalty_points':
      case 'pontos':
        return String(ctx.customer.loyalty_points ?? 0)
      case 'birthday':
      case 'aniversario':
        return ctx.customer.birthday
          ? new Date(ctx.customer.birthday + 'T00:00:00').toLocaleDateString(
              'pt-BR',
              { day: '2-digit', month: 'long' }
            )
          : ''
      case 'restaurant':
      case 'restaurante':
      case 'restaurant_name':
        return ctx.restaurant.name
      case 'restaurant_phone':
        return ctx.restaurant.phone ?? ''
      default:
        return ctx.extras?.[key] ?? match
    }
  })
}

/**
 * Carrega dados de um customer + restaurant pra preencher o contexto.
 */
export async function loadTemplateContext(
  supabase: SupabaseClient,
  customerId: string,
  restaurantId: string
): Promise<TemplateContext> {
  const [{ data: customer }, { data: restaurant }] = await Promise.all([
    supabase
      .from('customers')
      .select('name, phone, email, loyalty_points, birthday')
      .eq('id', customerId)
      .maybeSingle(),
    supabase
      .from('restaurants')
      .select('name, phone')
      .eq('id', restaurantId)
      .maybeSingle(),
  ])

  return {
    customer: {
      name: (customer?.name as string) ?? 'Cliente',
      phone: customer?.phone as string | null,
      email: customer?.email as string | null,
      loyalty_points: Number(customer?.loyalty_points ?? 0),
      birthday: customer?.birthday as string | null,
    },
    restaurant: {
      name: (restaurant?.name as string) ?? 'Restaurante',
      phone: restaurant?.phone as string | null,
    },
  }
}

/**
 * Extrai as variaveis usadas num template (pra mostrar na UI).
 */
export function extractVariables(template: string): string[] {
  const matches = template.match(VARIABLE_REGEX)
  if (!matches) return []
  return [...new Set(matches)]
}
