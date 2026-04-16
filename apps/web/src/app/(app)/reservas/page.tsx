import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Reservation, Table, Customer } from '@txoko/shared'
import { ReservasView } from './reservas-view'

export const dynamic = 'force-dynamic'

export default async function ReservasPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  // Load 60 days window for calendar
  const windowStart = new Date(today)
  windowStart.setDate(today.getDate() - 7)
  const windowEnd = new Date(today)
  windowEnd.setDate(today.getDate() + 53)

  const [{ data: reservations }, { data: tables }, { data: customers }] = await Promise.all([
    supabase
      .from('reservations')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .gte('scheduled_for', windowStart.toISOString())
      .lte('scheduled_for', windowEnd.toISOString())
      .order('scheduled_for', { ascending: true }),
    supabase
      .from('tables')
      .select('id, number, capacity, status, area')
      .eq('restaurant_id', restaurantId)
      .order('number', { ascending: true }),
    supabase
      .from('customers')
      .select('id, name, phone, email')
      .eq('restaurant_id', restaurantId)
      .order('name', { ascending: true })
      .limit(500),
  ])

  return (
    <ReservasView
      reservations={(reservations ?? []) as unknown as Reservation[]}
      tables={(tables ?? []) as unknown as Pick<Table, 'id' | 'number' | 'capacity' | 'status' | 'area'>[]}
      customers={(customers ?? []) as unknown as Pick<Customer, 'id' | 'name' | 'phone' | 'email'>[]}
      restaurantId={restaurantId}
    />
  )
}
