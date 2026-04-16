'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const TriggerTypeSchema = z.enum([
  'new_customer',
  'no_visit_30d',
  'birthday',
  'low_stock',
  'new_order',
  'order_completed',
  'review_negative',
])

const ActionTypeSchema = z.enum([
  'send_whatsapp',
  'send_email',
  'create_task',
  'notify_staff',
  'apply_discount',
])

const AutomationInputSchema = z.object({
  name: z.string().min(1, 'Nome obrigatorio').max(120),
  description: z.string().max(500).optional(),
  trigger_type: TriggerTypeSchema,
  trigger_config: z.record(z.string(), z.unknown()).default(() => ({})),
  action_type: ActionTypeSchema,
  action_config: z.record(z.string(), z.unknown()).default(() => ({})),
  enabled: z.boolean().default(true),
})

export type AutomationInput = z.infer<typeof AutomationInputSchema>

// ---------------------------------------------------------------------------
// CRUD actions
// ---------------------------------------------------------------------------

export async function createAutomation(raw: AutomationInput) {
  const parsed = AutomationInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  // Generate a unique code for this user-created automation
  const code = `custom_${Date.now()}`

  const { data, error } = await supabase
    .from('automations')
    .insert({
      restaurant_id,
      code,
      // Legacy columns — inferred from type
      trigger: parsed.data.trigger_type,
      action: parsed.data.action_type,
      area: 'custom',
      // New builder columns
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      trigger_type: parsed.data.trigger_type,
      trigger_config: parsed.data.trigger_config,
      action_type: parsed.data.action_type,
      action_config: parsed.data.action_config,
      enabled: parsed.data.enabled,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/automacoes')
  return { ok: true, id: data.id }
}

export async function updateAutomation(id: string, raw: Partial<AutomationInput>) {
  const partial = AutomationInputSchema.partial().safeParse(raw)
  if (!partial.success) {
    return { error: partial.error.issues.map((i) => i.message).join(', ') }
  }

  const supabase = await createClient()

  const payload: Record<string, unknown> = {}
  if (partial.data.name !== undefined) payload.name = partial.data.name
  if (partial.data.description !== undefined) payload.description = partial.data.description
  if (partial.data.trigger_type !== undefined) {
    payload.trigger_type = partial.data.trigger_type
    payload.trigger = partial.data.trigger_type
  }
  if (partial.data.trigger_config !== undefined) payload.trigger_config = partial.data.trigger_config
  if (partial.data.action_type !== undefined) {
    payload.action_type = partial.data.action_type
    payload.action = partial.data.action_type
  }
  if (partial.data.action_config !== undefined) payload.action_config = partial.data.action_config
  if (partial.data.enabled !== undefined) payload.enabled = partial.data.enabled

  const { error } = await supabase.from('automations').update(payload).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/automacoes')
  return { ok: true }
}

export async function deleteAutomation(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('automations').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/automacoes')
  return { ok: true }
}

export async function toggleAutomation(id: string, enabled: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('automations')
    .update({ enabled })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/automacoes')
  return { ok: true }
}

export async function testAutomation(id: string) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: automation, error: fetchError } = await supabase
    .from('automations')
    .select('id, action_type, action_config, trigger_type, name')
    .eq('id', id)
    .single()

  if (fetchError || !automation) {
    return { error: fetchError?.message ?? 'Automacao nao encontrada' }
  }

  // Simulate execution — log the test run
  const result = {
    test: true,
    message: `Teste executado para a automacao "${automation.name ?? automation.id}"`,
    action_type: automation.action_type,
    action_config: automation.action_config,
    timestamp: new Date().toISOString(),
  }

  const { error: runError } = await supabase.from('automation_runs').insert({
    automation_id: id,
    restaurant_id,
    status: 'success',
    target_entity_id: 'test',
    result,
  })

  // Also bump run_count and last_run_at on the automation
  await supabase
    .from('automations')
    .update({
      last_run_at: new Date().toISOString(),
      run_count: ((automation as unknown as { run_count?: number }).run_count ?? 0) + 1,
    })
    .eq('id', id)

  if (runError) return { error: runError.message }

  revalidatePath('/automacoes')
  return { ok: true, result }
}

export async function listAutomationRuns(automationId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('automation_runs')
    .select('id, automation_id, triggered_at, status, target_entity_id, result')
    .eq('automation_id', automationId)
    .order('triggered_at', { ascending: false })
    .limit(50)

  if (error) return { error: error.message }
  return { ok: true, runs: data ?? [] }
}
