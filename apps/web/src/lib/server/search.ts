'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export type SearchResult = {
  type: 'product' | 'customer' | 'order'
  id: string
  title: string
  subtitle: string
  href: string
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const like = `%${q}%`

  const [productsRes, customersRes, ordersRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, price, is_active')
      .eq('restaurant_id', restaurantId)
      .ilike('name', like)
      .limit(5),
    supabase
      .from('customers')
      .select('id, name, phone, email')
      .eq('restaurant_id', restaurantId)
      .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
      .limit(5),
    supabase
      .from('orders')
      .select('id, total, status, created_at')
      .eq('restaurant_id', restaurantId)
      .ilike('id', like)
      .limit(3),
  ])

  const results: SearchResult[] = []

  for (const p of productsRes.data ?? []) {
    results.push({
      type: 'product',
      id: p.id as string,
      title: p.name as string,
      subtitle: `Produto · R$ ${Number(p.price).toFixed(2).replace('.', ',')}`,
      href: '/dashboard/cardapio',
    })
  }

  for (const c of customersRes.data ?? []) {
    const parts = [c.phone, c.email].filter(Boolean).join(' · ')
    results.push({
      type: 'customer',
      id: c.id as string,
      title: c.name as string,
      subtitle: `Cliente${parts ? ' · ' + parts : ''}`,
      href: '/dashboard/clientes',
    })
  }

  for (const o of ordersRes.data ?? []) {
    results.push({
      type: 'order',
      id: o.id as string,
      title: `Pedido #${(o.id as string).slice(0, 6)}`,
      subtitle: `R$ ${Number(o.total).toFixed(2).replace('.', ',')} · ${o.status}`,
      href: '/dashboard/pedidos',
    })
  }

  return results
}
