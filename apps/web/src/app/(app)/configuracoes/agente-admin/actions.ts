'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

// =============================================================
// Tipos
// =============================================================

export type AdminAgentTone = 'casual' | 'formal' | 'direto'
export type BriefingFormat = 'text' | 'audio' | 'both'
export type BriefingVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
export type AdminAgentRole = 'owner' | 'manager' | 'kitchen' | 'cashier' | 'waiter'
export type AdminActionStatus =
  | 'success'
  | 'failed'
  | 'confirmation_pending'
  | 'rejected_by_user'
  | 'denied_by_rbac'

export type AdminAgentConfig = {
  enabled: boolean
  persona: string
  tone: AdminAgentTone
  confirm_above_brl: number
  confirm_destructive: boolean
  briefing_enabled: boolean
  briefing_hour: number
  briefing_phone: string | null
  briefing_format: BriefingFormat
  briefing_voice: BriefingVoice
  alerts_enabled: boolean
  max_actions_per_hour: number
}

export type AdminAgentUser = {
  id: string
  phone: string
  display_name: string
  role: AdminAgentRole
  active: boolean
  actions_count: number
  last_action_at: string | null
  created_at: string
}

export type AdminAgentActionRow = {
  id: string
  admin_phone: string
  admin_name: string | null
  input_kind: string
  input_excerpt: string | null
  tool_name: string
  tool_input: Record<string, unknown>
  status: AdminActionStatus
  error_message: string | null
  cost_brl: number | null
  duration_ms: number | null
  created_at: string
}

export type AdminAgentAnalytics = {
  total_actions: number
  success_actions: number
  failed_actions: number
  rejected_actions: number
  rbac_denied: number
  total_cost_brl: number
  total_minutes_saved: number
  briefings_delivered: number
  briefings_failed: number
  active_admins: number
  daily: { date: string; label: string; total: number; success: number; failed: number }[]
  by_tool: {
    tool_name: string
    count: number
    failed: number
    cost_brl: number
    minutes_saved: number
  }[]
  by_status: { status: string; count: number; pct: number }[]
  briefings: {
    date: string
    phone: string
    format: string
    delivered: boolean
    error: string | null
  }[]
  top_admins: { phone: string; name: string | null; count: number; cost_brl: number }[]
}

export type CustomerAgentAnalytics = {
  total_events: number
  replies: number
  escalations: number
  skipped: number
  send_failed: number
  auto_resolution_rate: number
  by_mode: { chat: number; order_taking: number }
  daily: { date: string; label: string; replies: number; escalations: number }[]
  top_escalation_reasons: { reason: string; count: number }[]
  orders_confirmed: number
  total_tool_calls: number
}

export type AgentHealthCheck = {
  key: string
  label: string
  ok: boolean
  detail: string
}

export type AdminAgentSuggestion = {
  id: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  action_label: string
  action_url: string
  metric: string
}

export type AgentTestToolCall = {
  name: string
  input: unknown
  result: string
  ok: boolean
}

export type AgentTestResult =
  | {
      ok: true
      text: string
      iterations: number
      tokens_in: number
      tokens_out: number
      cost_brl: number
      tool_calls: AgentTestToolCall[]
    }
  | { ok: false; error: string }

type AdminAgentRow = {
  enabled: boolean | null
  persona: string | null
  tone: string | null
  confirm_above_brl: number | string | null
  confirm_destructive: boolean | null
  briefing_enabled: boolean | null
  briefing_hour: number | string | null
  briefing_phone: string | null
  briefing_format: string | null
  briefing_voice: string | null
  alerts_enabled: boolean | null
  max_actions_per_hour: number | string | null
}

// =============================================================
// Config
// =============================================================

export async function getAdminAgentConfig(): Promise<AdminAgentConfig> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { data } = await supabase
    .from('admin_agents')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!data) {
    const { data: created } = await supabase
      .from('admin_agents')
      .insert({ restaurant_id: restaurantId })
      .select('*')
      .single()
    return normalizeConfig(created as AdminAgentRow | null)
  }
  return normalizeConfig(data as AdminAgentRow)
}

function normalizeConfig(row: AdminAgentRow | null): AdminAgentConfig {
  return {
    enabled: row?.enabled ?? false,
    persona: row?.persona ?? 'um co-piloto operacional eficiente e direto',
    tone: (row?.tone ?? 'casual') as AdminAgentTone,
    confirm_above_brl: Number(row?.confirm_above_brl ?? 100),
    confirm_destructive: row?.confirm_destructive ?? true,
    briefing_enabled: row?.briefing_enabled ?? true,
    briefing_hour: Number(row?.briefing_hour ?? 8),
    briefing_phone: row?.briefing_phone ?? null,
    briefing_format: (row?.briefing_format ?? 'text') as BriefingFormat,
    briefing_voice: (row?.briefing_voice ?? 'nova') as BriefingVoice,
    alerts_enabled: row?.alerts_enabled ?? true,
    max_actions_per_hour: Number(row?.max_actions_per_hour ?? 50),
  }
}

const configSchema = z.object({
  enabled: z.boolean(),
  persona: z.string().max(500),
  tone: z.enum(['casual', 'formal', 'direto']),
  confirm_above_brl: z.number().int().min(0).max(100000),
  confirm_destructive: z.boolean(),
  briefing_enabled: z.boolean(),
  briefing_hour: z.number().int().min(0).max(23),
  briefing_phone: z.string().regex(/^\d{10,15}$/).nullable(),
  briefing_format: z.enum(['text', 'audio', 'both']),
  briefing_voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']),
  alerts_enabled: z.boolean(),
  max_actions_per_hour: z.number().int().min(1).max(500),
})

export async function updateAdminAgentConfig(
  input: AdminAgentConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = configSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' }
  }
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { error } = await supabase
    .from('admin_agents')
    .upsert({ restaurant_id: restaurantId, ...parsed.data }, { onConflict: 'restaurant_id' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/agente-admin')
  return { ok: true }
}

// =============================================================
// Briefing
// =============================================================

export async function sendBriefingNow(): Promise<
  { ok: true; audio_url?: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { data: config } = await supabase
    .from('admin_agents')
    .select('briefing_phone, briefing_format, briefing_voice')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!config?.briefing_phone) {
    return { ok: false, error: 'Configure o telefone de briefing primeiro' }
  }
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .eq('id', restaurantId)
    .maybeSingle()
  const { data: channel } = await supabase
    .from('channels')
    .select('id, config')
    .eq('restaurant_id', restaurantId)
    .eq('type', 'whatsapp_zapi')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!channel) {
    return { ok: false, error: 'Nenhum canal WhatsApp ativo. Configure em Canais.' }
  }
  const { createServiceClient } = await import('@/lib/supabase/service')
  const service = createServiceClient()
  const { sendBriefing } = await import('@/lib/server/admin-agent/briefing')
  const result = await sendBriefing(service, {
    restaurantId,
    restaurantName: restaurant?.name ?? 'Restaurante',
    recipientPhone: config.briefing_phone,
    channel: { id: channel.id, config: channel.config },
    format: config.briefing_format ?? 'text',
    voice: config.briefing_voice ?? 'nova',
    force: true,
  })
  return result.ok
    ? { ok: true, ...(result.audio_url ? { audio_url: result.audio_url } : {}) }
    : { ok: false, error: result.reason }
}

// =============================================================
// Equipe (admin_agent_users)
// =============================================================

export async function listAdminAgentUsers(): Promise<AdminAgentUser[]> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { data } = await supabase
    .from('admin_agent_users')
    .select('id, phone, display_name, role, active, actions_count, last_action_at, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true })
  type Row = {
    id: string
    phone: string
    display_name: string
    role: AdminAgentRole
    active: boolean
    actions_count: number | string | null
    last_action_at: string | null
    created_at: string
  }
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    phone: row.phone,
    display_name: row.display_name,
    role: row.role,
    active: row.active,
    actions_count: Number(row.actions_count ?? 0),
    last_action_at: row.last_action_at ?? null,
    created_at: row.created_at,
  }))
}

const createUserSchema = z.object({
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{10,15}$/)),
  display_name: z.string().min(2).max(100),
  role: z.enum(['owner', 'manager', 'kitchen', 'cashier', 'waiter']),
})

export async function createAdminAgentUser(input: {
  phone: string
  display_name: string
  role: AdminAgentRole
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = createUserSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? 'Dados invalidos. Telefone deve ter 10-15 digitos.',
    }
  }
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { data, error } = await supabase
    .from('admin_agent_users')
    .insert({
      restaurant_id: restaurantId,
      phone: parsed.data.phone,
      display_name: parsed.data.display_name.trim(),
      role: parsed.data.role,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Esse telefone ja esta cadastrado.' }
    }
    return { ok: false, error: error.message }
  }
  revalidatePath('/configuracoes/agente-admin')
  return { ok: true, id: (data as { id: string }).id }
}

export async function updateAdminAgentUser(input: {
  id: string
  role?: AdminAgentRole
  active?: boolean
  display_name?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const updates: { role?: AdminAgentRole; active?: boolean; display_name?: string } = {}
  if (input.role) updates.role = input.role
  if (typeof input.active === 'boolean') updates.active = input.active
  if (input.display_name) updates.display_name = input.display_name.trim()
  if (Object.keys(updates).length === 0) return { ok: true }
  const { error } = await supabase.from('admin_agent_users').update(updates).eq('id', input.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/agente-admin')
  return { ok: true }
}

export async function deleteAdminAgentUser(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('admin_agent_users').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/agente-admin')
  return { ok: true }
}

// =============================================================
// Audit (admin_agent_actions)
// =============================================================

export async function listAdminAgentActions(limit = 100): Promise<AdminAgentActionRow[]> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { data } = await supabase
    .from('admin_agent_actions')
    .select(
      'id, admin_phone, admin_user_id, input_kind, input_excerpt, tool_name, tool_input, status, error_message, cost_brl, duration_ms, created_at'
    )
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  type Row = {
    id: string
    admin_phone: string
    admin_user_id: string | null
    input_kind: string
    input_excerpt: string | null
    tool_name: string
    tool_input: Record<string, unknown> | null
    status: AdminActionStatus
    error_message: string | null
    cost_brl: number | string | null
    duration_ms: number | string | null
    created_at: string
  }
  const rows = (data ?? []) as Row[]
  const userIds = Array.from(
    new Set(rows.map((row) => row.admin_user_id).filter((id): id is string => id !== null))
  )
  const { data: users } =
    userIds.length > 0
      ? await supabase.from('admin_agent_users').select('id, display_name').in('id', userIds)
      : { data: [] }
  const nameById: Record<string, string> = {}
  for (const user of (users ?? []) as { id: string; display_name: string }[]) {
    nameById[user.id] = user.display_name
  }
  return rows.map((row) => ({
    id: row.id,
    admin_phone: row.admin_phone,
    admin_name: row.admin_user_id ? nameById[row.admin_user_id] ?? null : null,
    input_kind: row.input_kind,
    input_excerpt: row.input_excerpt ?? null,
    tool_name: row.tool_name,
    tool_input: row.tool_input ?? {},
    status: row.status,
    error_message: row.error_message ?? null,
    cost_brl: row.cost_brl !== null ? Number(row.cost_brl) : null,
    duration_ms: row.duration_ms !== null ? Number(row.duration_ms) : null,
    created_at: row.created_at,
  }))
}

// =============================================================
// Test mode
// =============================================================

export async function runAgentTest(input: {
  admin_user_id: string
  message: string
  image_url?: string
}): Promise<AgentTestResult> {
  if (!input.message?.trim()) return { ok: false, error: 'Mensagem vazia.' }
  if (input.message.length > 2000) {
    return { ok: false, error: 'Mensagem muito longa (max 2000 chars).' }
  }
  if (input.image_url && !/^https?:\/\//i.test(input.image_url)) {
    return { ok: false, error: 'image_url deve comecar com http(s)://' }
  }
  const { createServiceClient } = await import('@/lib/supabase/service')
  const { runAdminAgent } = await import('@/lib/server/admin-agent/runner')
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { data: admin, error: adminError } = await supabase
    .from('admin_agent_users')
    .select('id, phone, display_name, role, active')
    .eq('id', input.admin_user_id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (adminError) return { ok: false, error: `Erro ao resolver admin: ${adminError.message}` }
  if (!admin) return { ok: false, error: 'Admin nao encontrado neste restaurante.' }
  if (!admin.active) {
    return { ok: false, error: `Admin "${admin.display_name}" esta desativado.` }
  }
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .eq('id', restaurantId)
    .maybeSingle()
  const { data: agent } = await supabase
    .from('admin_agents')
    .select('enabled, persona, tone')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!agent || !agent.enabled) {
    return {
      ok: false,
      error: 'Agente desabilitado em admin_agents. Habilite em /configuracoes/agente-admin antes.',
    }
  }
  const service = createServiceClient()
  try {
    const result = await runAdminAgent({
      supabase: service,
      restaurantId,
      restaurantName: restaurant?.name ?? 'Restaurante',
      adminUserId: admin.id,
      adminPhone: admin.phone,
      adminRole: admin.role,
      adminName: admin.display_name,
      conversationId: null,
      messages: [{ role: 'user', content: input.message }],
      inputKind: input.image_url ? 'image' : 'text',
      lastImageUrl: input.image_url ?? null,
      inputAttachmentUrl: input.image_url ?? null,
      persona: (agent.persona ?? undefined) || undefined,
      tone: agent.tone ?? undefined,
    })
    return result.action === 'reply'
      ? {
          ok: true,
          text: result.text,
          iterations: result.iterations,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          cost_brl: result.costBrl,
          tool_calls: result.toolCalls,
        }
      : result.action === 'skip'
        ? { ok: false, error: `Agente pulou: ${result.reason}` }
        : { ok: false, error: `Agente falhou: ${result.reason}` }
  } catch (err) {
    return { ok: false, error: `Excecao: ${(err as Error).message}` }
  }
}

// =============================================================
// Analytics
// =============================================================

// Minutos economizados estimados por tool (so conta status=success)
const TOOL_MINUTES_SAVED: Record<string, number> = {
  consultar_estoque: 1.5,
  consultar_pedidos: 1.5,
  consultar_caixa: 1.5,
  consultar_despesas: 1.5,
  consultar_reservas: 1.5,
  consultar_cliente: 1.5,
  top_clientes: 1.5,
  relatorio: 2,
  atualizar_estoque: 3,
  atualizar_horario: 3,
  registrar_despesa: 3,
  criar_produto: 3,
  desativar_produto: 2,
  criar_reserva: 3,
  responder_review: 5,
  processar_cupom_compra: 8,
  processar_boleto: 6,
  reconciliar_pix: 6,
  adicionar_item_pedido: 2,
  fechar_pedido: 2,
  cancelar_pedido: 2,
  marcar_prato_pronto: 1,
  dividir_conta: 4,
  transferir_mesa: 1,
  lancar_campanha: 15,
  gerenciar_acesso: 2,
}

export async function getAdminAgentAnalytics(days = 30): Promise<AdminAgentAnalytics> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const since = new Date(Date.now() - 24 * days * 3600000).toISOString()
  const [actionsRes, briefingsRes, adminsRes] = await Promise.all([
    supabase
      .from('admin_agent_actions')
      .select('admin_phone, admin_user_id, tool_name, status, cost_brl, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    supabase
      .from('admin_agent_briefings')
      .select('briefing_date, recipient_phone, payload, delivered_at, delivery_error, audio_url')
      .eq('restaurant_id', restaurantId)
      .gte('briefing_date', since.slice(0, 10))
      .order('briefing_date', { ascending: false }),
    supabase
      .from('admin_agent_users')
      .select('id, display_name, phone, active')
      .eq('restaurant_id', restaurantId)
      .eq('active', true),
  ])
  type ActionRow = {
    admin_phone: string
    admin_user_id: string | null
    tool_name: string
    status: string
    cost_brl: number | string | null
    created_at: string
  }
  type BriefingRow = {
    briefing_date: string
    recipient_phone: string
    payload: Record<string, unknown> | null
    delivered_at: string | null
    delivery_error: string | null
    audio_url: string | null
  }
  type AdminRow = { id: string; display_name: string; phone: string; active: boolean }
  const actions = (actionsRes.data ?? []) as ActionRow[]
  const briefings = (briefingsRes.data ?? []) as BriefingRow[]
  const admins = (adminsRes.data ?? []) as AdminRow[]

  const adminNameById = new Map<string, string>()
  for (const admin of admins) adminNameById.set(admin.id, admin.display_name)

  const totalActions = actions.length
  const successActions = actions.filter((a) => a.status === 'success').length
  const failedActions = actions.filter((a) => a.status === 'failed').length
  const rejectedActions = actions.filter((a) => a.status === 'rejected_by_user').length
  const rbacDenied = actions.filter((a) => a.status === 'denied_by_rbac').length
  const totalCostBrl = actions.reduce((sum, a) => sum + (Number(a.cost_brl) || 0), 0)
  let totalMinutesSaved = 0
  for (const action of actions) {
    if (action.status === 'success') {
      totalMinutesSaved += TOOL_MINUTES_SAVED[action.tool_name] ?? 2
    }
  }

  const byDay = new Map<string, { total: number; success: number; failed: number }>()
  for (const action of actions) {
    const day = action.created_at.slice(0, 10)
    const entry = byDay.get(day) ?? { total: 0, success: 0, failed: 0 }
    entry.total += 1
    if (action.status === 'success') entry.success += 1
    if (action.status === 'failed') entry.failed += 1
    byDay.set(day, entry)
  }
  const daily: AdminAgentAnalytics['daily'] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - 86400000 * i)
    const key = date.toISOString().slice(0, 10)
    const entry = byDay.get(key) ?? { total: 0, success: 0, failed: 0 }
    daily.push({
      date: key,
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: entry.total,
      success: entry.success,
      failed: entry.failed,
    })
  }

  const byToolMap = new Map<string, { count: number; failed: number; cost: number }>()
  for (const action of actions) {
    const tool = action.tool_name
    const entry = byToolMap.get(tool) ?? { count: 0, failed: 0, cost: 0 }
    entry.count += 1
    if (action.status === 'failed') entry.failed += 1
    entry.cost += Number(action.cost_brl) || 0
    byToolMap.set(tool, entry)
  }
  const byTool = Array.from(byToolMap.entries())
    .map(([tool_name, entry]) => ({
      tool_name,
      count: entry.count,
      failed: entry.failed,
      cost_brl: entry.cost,
      minutes_saved: (entry.count - entry.failed) * (TOOL_MINUTES_SAVED[tool_name] ?? 2),
    }))
    .sort((a, b) => b.count - a.count)

  const byStatusMap = new Map<string, number>()
  for (const action of actions) {
    const status = action.status
    byStatusMap.set(status, (byStatusMap.get(status) ?? 0) + 1)
  }
  const byStatus = Array.from(byStatusMap.entries())
    .map(([status, count]) => ({
      status,
      count,
      pct: totalActions > 0 ? (count / totalActions) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)

  const byAdminMap = new Map<string, { name: string | null; count: number; cost: number }>()
  for (const action of actions) {
    const phone = action.admin_phone
    const name = action.admin_user_id ? adminNameById.get(action.admin_user_id) ?? null : null
    const entry = byAdminMap.get(phone) ?? { name, count: 0, cost: 0 }
    entry.count += 1
    entry.cost += Number(action.cost_brl) || 0
    if (!entry.name && name) entry.name = name
    byAdminMap.set(phone, entry)
  }
  const topAdmins = Array.from(byAdminMap.entries())
    .map(([phone, entry]) => ({
      phone,
      name: entry.name,
      count: entry.count,
      cost_brl: entry.cost,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const briefingList = briefings.slice(0, 30).map((b) => {
    const payload = b.payload ?? {}
    const format = typeof payload.format === 'string' ? payload.format : b.audio_url ? 'audio' : 'text'
    return {
      date: b.briefing_date,
      phone: b.recipient_phone,
      format,
      delivered: !!b.delivered_at,
      error: b.delivery_error ?? null,
    }
  })

  return {
    total_actions: totalActions,
    success_actions: successActions,
    failed_actions: failedActions,
    rejected_actions: rejectedActions,
    rbac_denied: rbacDenied,
    total_cost_brl: totalCostBrl,
    total_minutes_saved: totalMinutesSaved,
    briefings_delivered: briefings.filter((b) => b.delivered_at).length,
    briefings_failed: briefings.filter((b) => b.delivery_error).length,
    active_admins: admins.length,
    daily,
    by_tool: byTool,
    by_status: byStatus,
    briefings: briefingList,
    top_admins: topAdmins,
  }
}

export async function getCustomerAgentAnalytics(days = 30): Promise<CustomerAgentAnalytics> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const since = new Date(Date.now() - 24 * days * 3600000).toISOString()
  const { data } = await supabase
    .from('conversation_events')
    .select('type, data, created_at, conversations!inner(restaurant_id)')
    .eq('conversations.restaurant_id', restaurantId)
    .in('type', ['bot_replied', 'bot_escalated', 'bot_skipped', 'bot_send_failed'])
    .gte('created_at', since)
    .order('created_at', { ascending: true })
  type EventRow = {
    type: string
    data: {
      mode?: string
      reason?: string
      tool_calls?: { name?: string; error?: unknown }[]
    } | null
    created_at: string
  }
  const events = (data ?? []) as EventRow[]
  const totalEvents = events.length
  const replies = events.filter((e) => e.type === 'bot_replied').length
  const escalations = events.filter((e) => e.type === 'bot_escalated').length
  const skipped = events.filter((e) => e.type === 'bot_skipped').length
  const sendFailed = events.filter((e) => e.type === 'bot_send_failed').length
  const handled = replies + escalations

  const byMode = { chat: 0, order_taking: 0 }
  for (const event of events) {
    if (event.type === 'bot_replied' || event.type === 'bot_escalated') {
      if ((event.data?.mode ?? 'chat') === 'order_taking') byMode.order_taking++
      else byMode.chat++
    }
  }

  const byDay = new Map<string, { replies: number; escalations: number }>()
  for (const event of events) {
    const day = event.created_at.slice(0, 10)
    const entry = byDay.get(day) ?? { replies: 0, escalations: 0 }
    if (event.type === 'bot_replied') entry.replies++
    if (event.type === 'bot_escalated') entry.escalations++
    byDay.set(day, entry)
  }
  const daily: CustomerAgentAnalytics['daily'] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - 86400000 * i)
    const key = date.toISOString().slice(0, 10)
    const entry = byDay.get(key) ?? { replies: 0, escalations: 0 }
    daily.push({
      date: key,
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      replies: entry.replies,
      escalations: entry.escalations,
    })
  }

  const reasonCounts = new Map<string, number>()
  for (const event of events) {
    if (event.type !== 'bot_escalated') continue
    const reason = event.data?.reason ?? '(sem motivo)'
    const truncated = reason.length > 80 ? reason.slice(0, 80) + '…' : reason
    reasonCounts.set(truncated, (reasonCounts.get(truncated) ?? 0) + 1)
  }
  const topEscalationReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  let ordersConfirmed = 0
  let totalToolCalls = 0
  for (const event of events) {
    if (event.type !== 'bot_replied') continue
    const toolCalls = event.data?.tool_calls
    if (Array.isArray(toolCalls)) {
      totalToolCalls += toolCalls.length
      for (const call of toolCalls) {
        if (call.name === 'confirmar_pedido' && !call.error) ordersConfirmed++
      }
    }
  }

  return {
    total_events: totalEvents,
    replies,
    escalations,
    skipped,
    send_failed: sendFailed,
    auto_resolution_rate: handled > 0 ? (replies / handled) * 100 : 0,
    by_mode: byMode,
    daily,
    top_escalation_reasons: topEscalationReasons,
    orders_confirmed: ordersConfirmed,
    total_tool_calls: totalToolCalls,
  }
}

// =============================================================
// Sugestoes (anomalias leves calculadas on-demand, 7 dias)
// =============================================================

export async function getAgentSuggestions(): Promise<AdminAgentSuggestion[]> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const since = new Date(Date.now() - 604800000).toISOString()
  const suggestions: AdminAgentSuggestion[] = []

  const { data: escalated } = await supabase
    .from('conversation_events')
    .select('data, conversations!inner(restaurant_id)')
    .eq('conversations.restaurant_id', restaurantId)
    .eq('type', 'bot_escalated')
    .gte('created_at', since)
  type EscalatedRow = { data: { reason?: string } | null }
  const escalatedRows = (escalated ?? []) as EscalatedRow[]
  if (escalatedRows.length > 0) {
    const reasonCounts = new Map<string, number>()
    for (const row of escalatedRows) {
      const reason = row.data?.reason
      if (!reason) continue
      const key = reason.toLowerCase().slice(0, 60)
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1)
    }
    for (const [reason, count] of Array.from(reasonCounts.entries())
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)) {
      suggestions.push({
        id: `kb_gap:${reason.slice(0, 30).replace(/\s/g, '_')}`,
        type: 'kb_gap',
        severity: count >= 8 ? 'warning' : 'info',
        title: 'Possivel gap na base de conhecimento',
        description: `Agente escalou ${count}x essa semana com o motivo "${reason.slice(0, 60)}". Vale criar uma FAQ pra reduzir escalations.`,
        action_label: 'Adicionar FAQ',
        action_url: '/configuracoes/conhecimento',
        metric: `${count} escalations`,
      })
    }
  }

  const { data: actionRows } = await supabase
    .from('admin_agent_actions')
    .select('tool_name, status')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', since)
  type ToolStatusRow = { tool_name: string; status: string }
  const toolRows = (actionRows ?? []) as ToolStatusRow[]
  if (toolRows.length > 0) {
    const byTool = new Map<string, { failed: number; total: number }>()
    for (const row of toolRows) {
      const tool = row.tool_name
      const entry = byTool.get(tool) ?? { failed: 0, total: 0 }
      entry.total += 1
      if (row.status === 'failed') entry.failed += 1
      byTool.set(tool, entry)
    }
    for (const [tool, entry] of byTool.entries()) {
      if (entry.failed >= 3 && tool !== '__chat__') {
        const pct = ((entry.failed / entry.total) * 100).toFixed(0)
        suggestions.push({
          id: `tool_error:${tool}`,
          type: 'tool_error_spike',
          severity: entry.failed >= 6 ? 'critical' : 'warning',
          title: `Tool "${tool}" falhou ${entry.failed}x essa semana`,
          description: `${pct}% das chamadas falharam (${entry.failed}/${entry.total}). Pode ser dado faltando, RBAC, ou bug. Veja o detalhe no audit.`,
          action_label: 'Ver detalhes',
          action_url: '/configuracoes/agente-admin?tab=atividade',
          metric: `${entry.failed} erros`,
        })
      }
    }
  }

  const { data: lastBriefings } = await supabase
    .from('admin_agent_briefings')
    .select('delivered_at, delivery_error, briefing_date')
    .eq('restaurant_id', restaurantId)
    .order('briefing_date', { ascending: false })
    .limit(3)
  type BriefingStatusRow = { delivered_at: string | null; delivery_error: string | null }
  const briefingRows = (lastBriefings ?? []) as BriefingStatusRow[]
  if (
    briefingRows.length >= 3 &&
    briefingRows.every((b) => b.delivery_error && !b.delivered_at)
  ) {
    suggestions.push({
      id: 'briefing_failing',
      type: 'briefing_failure',
      severity: 'critical',
      title: 'Briefing diario falhando ha 3 dias',
      description:
        'Ultimos 3 briefings nao foram entregues. Provavel: Z-API instavel, telefone errado, ou OPENAI_API_KEY faltando (se formato=audio).',
      action_label: 'Configurar briefing',
      action_url: '/configuracoes/agente-admin',
      metric: '3 falhas seguidas',
    })
  }

  const { count: actionCount } = await supabase
    .from('admin_agent_actions')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .gte('created_at', since)
  const { count: activeAdmins } = await supabase
    .from('admin_agent_users')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
  if ((actionCount ?? 0) === 0 && (activeAdmins ?? 0) > 0) {
    suggestions.push({
      id: 'agent_idle_7d',
      type: 'agent_idle',
      severity: 'info',
      title: 'Agente admin sem nenhum uso esta semana',
      description: `Tem ${activeAdmins} admin${activeAdmins === 1 ? '' : 's'} cadastrado${activeAdmins === 1 ? '' : 's'} mas zero acoes em 7 dias. Eles sabem que podem mandar comando por WhatsApp? Teste em /configuracoes/agente-admin/test.`,
      action_label: 'Test mode',
      action_url: '/configuracoes/agente-admin/test',
      metric: '0 acoes',
    })
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('ai_agent_enabled')
    .eq('id', restaurantId)
    .maybeSingle()
  if (restaurant && !restaurant.ai_agent_enabled) {
    const { count: inboundCount } = await supabase
      .from('messages')
      .select('id, conversations!inner(restaurant_id)', { count: 'exact', head: true })
      .eq('conversations.restaurant_id', restaurantId)
      .eq('direction', 'inbound')
      .eq('sender_type', 'user')
      .gte('created_at', since)
    if ((inboundCount ?? 0) >= 10) {
      suggestions.push({
        id: 'customer_agent_disabled_with_traffic',
        type: 'customer_agent_disabled',
        severity: 'warning',
        title: 'Agente cliente desabilitado com trafego ativo',
        description: `${inboundCount} mensagens de clientes chegaram em 7 dias mas o agente esta off. Ativando ele, ~70% das duvidas comuns sao respondidas automaticamente.`,
        action_label: 'Ativar agente',
        action_url: '/configuracoes/agente-admin',
        metric: `${inboundCount} msgs inbound`,
      })
    }
  }

  const { data: botEvents } = await supabase
    .from('conversation_events')
    .select('type, conversations!inner(restaurant_id)')
    .eq('conversations.restaurant_id', restaurantId)
    .in('type', ['bot_replied', 'bot_escalated'])
    .gte('created_at', since)
  type BotEventRow = { type: string }
  const botEventRows = (botEvents ?? []) as BotEventRow[]
  if (botEventRows.length >= 20) {
    const replies = botEventRows.filter((e) => e.type === 'bot_replied').length
    const handled = replies + botEventRows.filter((e) => e.type === 'bot_escalated').length
    const rate = handled > 0 ? (replies / handled) * 100 : 0
    if (rate < 70) {
      suggestions.push({
        id: 'low_auto_resolution',
        type: 'low_auto_resolution',
        severity: 'warning',
        title: 'Taxa de auto-resolucao baixa',
        description: `So ${rate.toFixed(0)}% das interacoes foram resolvidas pelo agente (${replies} respostas / ${handled} total). Mais FAQs na KB ou ajustar keywords pode subir essa taxa.`,
        action_label: 'Ver motivos',
        action_url: '/configuracoes/agente-admin/analytics',
        metric: `${rate.toFixed(0)}% auto-resolvido`,
      })
    }
  }

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id, name, current_stock, min_stock')
    .eq('restaurant_id', restaurantId)
  type IngredientRow = {
    id: string
    name: string
    current_stock: number | string | null
    min_stock: number | string | null
  }
  const lowStock = ((ingredients ?? []) as IngredientRow[]).filter(
    (i) => Number(i.current_stock) <= Number(i.min_stock ?? 0) && Number(i.min_stock ?? 0) > 0
  )
  if (lowStock.length >= 3) {
    suggestions.push({
      id: `low_stock_${lowStock.length}`,
      type: 'low_stock',
      severity: lowStock.length >= 8 ? 'critical' : 'warning',
      title: `${lowStock.length} insumos abaixo do minimo`,
      description: `Top 3: ${lowStock.slice(0, 3).map((i) => i.name).join(', ')}${lowStock.length > 3 ? ', ...' : ''}. Veja a lista completa em estoque.`,
      action_label: 'Ver estoque',
      action_url: '/estoque',
      metric: `${lowStock.length} abaixo`,
    })
  }

  const severityOrder: Record<AdminAgentSuggestion['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  }
  suggestions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
  return suggestions
}

// =============================================================
// Saude do sistema (checklist)
// =============================================================

export async function getAgentHealth(): Promise<AgentHealthCheck[]> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const checks: AgentHealthCheck[] = []

  checks.push({
    key: 'anthropic',
    label: 'Anthropic API key',
    ok: !!process.env.ANTHROPIC_API_KEY,
    detail: process.env.ANTHROPIC_API_KEY
      ? 'Configurada — agente texto/imagem funciona.'
      : 'Faltando — agente nao responde. Adicione via wrangler secret put ANTHROPIC_API_KEY.',
  })
  checks.push({
    key: 'groq',
    label: 'Groq Whisper (audio do dono → texto)',
    ok: !!process.env.GROQ_API_KEY,
    detail: process.env.GROQ_API_KEY
      ? 'Configurada — admin pode mandar audio pro agente.'
      : 'Faltando — audio do admin falha (mensagens texto/imagem ainda funcionam).',
  })
  checks.push({
    key: 'openai',
    label: 'OpenAI TTS (briefing audio)',
    ok: !!process.env.OPENAI_API_KEY,
    detail: process.env.OPENAI_API_KEY
      ? 'Configurada — briefing pode virar audio.'
      : 'Faltando — briefing audio falha (formato text continua funcionando).',
  })

  const { data: agent } = await supabase
    .from('admin_agents')
    .select('enabled, briefing_enabled, briefing_phone, briefing_format')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  checks.push({
    key: 'agent_enabled',
    label: 'Agente habilitado',
    ok: !!agent?.enabled,
    detail: agent?.enabled
      ? 'Ativo — recebe mensagens de admins cadastrados.'
      : 'Inativo — agente nao processa nada. Ative em /configuracoes/agente-admin.',
  })
  checks.push({
    key: 'briefing_config',
    label: 'Daily briefing configurado',
    ok: !!(agent?.briefing_enabled && agent?.briefing_phone),
    detail:
      agent?.briefing_enabled && agent?.briefing_phone
        ? `Configurado (telefone ${agent.briefing_phone}, formato ${agent.briefing_format ?? 'text'}).`
        : 'Faltando telefone ou desabilitado.',
  })

  const { count: adminCount } = await supabase
    .from('admin_agent_users')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
  checks.push({
    key: 'admins',
    label: 'Admins cadastrados',
    ok: (adminCount ?? 0) >= 1,
    detail:
      (adminCount ?? 0) >= 1
        ? `${adminCount} admin${adminCount === 1 ? '' : 's'} ativo${adminCount === 1 ? '' : 's'}.`
        : 'Nenhum admin cadastrado — agente nao tem com quem falar. Adicione em Acessos.',
  })

  const { count: channelCount } = await supabase
    .from('channels')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('type', 'whatsapp_zapi')
    .eq('status', 'active')
  checks.push({
    key: 'zapi',
    label: 'Canal WhatsApp Z-API ativo',
    ok: (channelCount ?? 0) >= 1,
    detail:
      (channelCount ?? 0) >= 1
        ? 'Canal ativo — agente envia/recebe via WhatsApp.'
        : 'Sem canal ativo — agente nao envia mensagens nem briefing. Configure em Canais.',
  })

  return checks
}
