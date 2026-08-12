// Tabela de custos estimados por evento (BRL). Ajuste conforme contratos reais.
const USD_BRL = 5.4

const COST_TABLE = {
  whatsapp_message: 0,
  email_send: 0.0008 * USD_BRL,
  sms_send: 0.4,
  agent_chat_reply: 0.001 * USD_BRL,
  agent_order_complete: 0.018 * USD_BRL,
  agent_order_inflight: 0.005 * USD_BRL,
}

export type RoiCostInputs = {
  recipientsSentWhatsapp?: number
  recipientsSentEmail?: number
  recipientsSentSms?: number
  chatRepliesHaiku?: number
  agentOrdersConfirmed?: number
  agentDraftsInflight?: number
  zapiSubscriptionMonthly?: number
  daysInPeriod?: number
}

export type RoiCostBreakdown = {
  whatsapp: number
  email: number
  sms: number
  ai_chat: number
  ai_order: number
  zapi_subscription: number
  total: number
}

export function estimateCosts(inputs: RoiCostInputs): RoiCostBreakdown {
  const whatsapp = (inputs.recipientsSentWhatsapp ?? 0) * COST_TABLE.whatsapp_message
  const email = (inputs.recipientsSentEmail ?? 0) * COST_TABLE.email_send
  const sms = (inputs.recipientsSentSms ?? 0) * COST_TABLE.sms_send
  const aiChat = (inputs.chatRepliesHaiku ?? 0) * COST_TABLE.agent_chat_reply
  const aiOrder =
    (inputs.agentOrdersConfirmed ?? 0) * COST_TABLE.agent_order_complete +
    (inputs.agentDraftsInflight ?? 0) * COST_TABLE.agent_order_inflight
  const zapiSubscription =
    inputs.zapiSubscriptionMonthly && inputs.daysInPeriod
      ? (inputs.zapiSubscriptionMonthly * inputs.daysInPeriod) / 30
      : 0
  return {
    whatsapp,
    email,
    sms,
    ai_chat: aiChat,
    ai_order: aiOrder,
    zapi_subscription: zapiSubscription,
    total: whatsapp + email + sms + aiChat + aiOrder + zapiSubscription,
  }
}

export function computeRoas(revenue: number, cost: number): number | null {
  return cost <= 0 ? null : revenue / cost
}
