export interface Automation {
  id: string
  trigger: string
  action: string
  area: 'operacao' | 'marketing' | 'financeiro' | 'estoque' | 'crm' | 'fiscal' | 'rh'
  enabled: boolean
  executionsToday: number
}

export const MOCK_AUTOMATIONS: Automation[] = [
  { id: 'auto-1', trigger: 'Estoque atinge nivel minimo', action: 'Gera ordem de compra e notifica gestor', area: 'estoque', enabled: true, executionsToday: 3 },
  { id: 'auto-2', trigger: 'Pedido delivery recebido', action: 'Envia para KDS + atualiza tempo + notifica cliente', area: 'operacao', enabled: true, executionsToday: 12 },
  { id: 'auto-3', trigger: 'Venda finalizada', action: 'Baixa estoque + registra financeiro + emite NFC-e', area: 'fiscal', enabled: true, executionsToday: 68 },
  { id: 'auto-4', trigger: 'Cliente 30 dias sem voltar', action: 'Envia cupom de desconto via WhatsApp', area: 'marketing', enabled: true, executionsToday: 2 },
  { id: 'auto-5', trigger: 'Aniversario do cliente', action: 'Envia mensagem personalizada + cupom especial', area: 'marketing', enabled: true, executionsToday: 1 },
  { id: 'auto-6', trigger: 'Avaliacao negativa recebida', action: 'Alerta gestor + sugere acao de recuperacao', area: 'crm', enabled: true, executionsToday: 0 },
  { id: 'auto-7', trigger: 'Fechamento do dia', action: 'Gera relatorio completo + envia por email ao dono', area: 'financeiro', enabled: true, executionsToday: 0 },
  { id: 'auto-8', trigger: 'Novo pedido no iFood', action: 'Aceita automaticamente + imprime na cozinha', area: 'operacao', enabled: true, executionsToday: 8 },
  { id: 'auto-9', trigger: 'Ficha tecnica atualizada', action: 'Recalcula preco de venda sugerido', area: 'estoque', enabled: false, executionsToday: 0 },
  { id: 'auto-10', trigger: 'Funcionario bate ponto', action: 'Registra presenca + calcula horas extras', area: 'rh', enabled: false, executionsToday: 0 },
  { id: 'auto-11', trigger: 'Mesa parada 15min sem pedido', action: 'Alerta garcom responsavel', area: 'operacao', enabled: true, executionsToday: 4 },
  { id: 'auto-12', trigger: 'Pedido atrasado na cozinha', action: 'Alerta KDS com destaque visual e sonoro', area: 'operacao', enabled: true, executionsToday: 2 },
  { id: 'auto-13', trigger: 'Conta fechada com NPS < 7', action: 'Registra no CRM + agenda follow-up', area: 'crm', enabled: true, executionsToday: 1 },
  { id: 'auto-14', trigger: 'Fornecedor com nota mais barata', action: 'Sugere troca de fornecedor para o insumo', area: 'estoque', enabled: false, executionsToday: 0 },
  { id: 'auto-15', trigger: 'Promocao agendada ativa', action: 'Atualiza precos no cardapio digital e iFood', area: 'operacao', enabled: true, executionsToday: 0 },
  { id: 'auto-16', trigger: 'Final do mes', action: 'Gera pacote XML + envia para contabilidade', area: 'fiscal', enabled: true, executionsToday: 0 },
  { id: 'auto-17', trigger: 'Cliente VIP identificado', action: 'Notifica garcom com preferencias e historico', area: 'crm', enabled: true, executionsToday: 3 },
  { id: 'auto-18', trigger: 'Novo cadastro de cliente', action: 'Envia boas-vindas + cupom de primeira compra', area: 'marketing', enabled: true, executionsToday: 1 },
  { id: 'auto-19', trigger: 'Sangria/suprimento registrado', action: 'Exige justificativa + registra no audit log', area: 'financeiro', enabled: true, executionsToday: 2 },
  { id: 'auto-20', trigger: 'Item em falta no estoque', action: 'Bloqueia item no cardapio digital', area: 'estoque', enabled: true, executionsToday: 1 },
]

export interface AutomationLog {
  id: string
  automationId: string
  trigger: string
  action: string
  timestamp: string
  status: 'success' | 'error'
}

const now = new Date()
function minsAgo(m: number) { return new Date(now.getTime() - m * 60000).toISOString() }

export const MOCK_AUTOMATION_LOGS: AutomationLog[] = [
  { id: 'log-1', automationId: 'auto-3', trigger: 'Venda #1247 finalizada', action: 'NFC-e emitida + estoque baixado', timestamp: minsAgo(5), status: 'success' },
  { id: 'log-2', automationId: 'auto-2', trigger: 'Pedido delivery #1248 (iFood)', action: 'Enviado para KDS cozinha', timestamp: minsAgo(8), status: 'success' },
  { id: 'log-3', automationId: 'auto-1', trigger: 'Mozzarella Bufala < 2kg', action: 'Ordem de compra gerada — Laticinios Serra Dourada', timestamp: minsAgo(15), status: 'success' },
  { id: 'log-4', automationId: 'auto-11', trigger: 'Mesa 7 parada 18min', action: 'Alerta enviado ao garcom Pedro', timestamp: minsAgo(22), status: 'success' },
  { id: 'log-5', automationId: 'auto-5', trigger: 'Aniversario: Ana Carolina Silva', action: 'WhatsApp enviado + cupom 15% gerado', timestamp: minsAgo(45), status: 'success' },
  { id: 'log-6', automationId: 'auto-17', trigger: 'Cliente VIP: Ricardo Mendes (Mesa 3)', action: 'Garcom notificado — alergia a crustaceos', timestamp: minsAgo(60), status: 'success' },
  { id: 'log-7', automationId: 'auto-8', trigger: 'Novo pedido iFood IF-88250', action: 'Aceito automaticamente + impresso', timestamp: minsAgo(72), status: 'success' },
  { id: 'log-8', automationId: 'auto-4', trigger: 'Gustavo Nascimento — 60 dias inativo', action: 'Erro: WhatsApp API indisponivel', timestamp: minsAgo(120), status: 'error' },
]

export const AREA_CONFIG: Record<string, { label: string; color: string }> = {
  operacao: { label: 'Operacao', color: 'bg-leaf/10 text-leaf' },
  marketing: { label: 'Marketing', color: 'bg-warm/10 text-warm' },
  financeiro: { label: 'Financeiro', color: 'bg-cloud/10 text-cloud' },
  estoque: { label: 'Estoque', color: 'bg-coral/10 text-coral' },
  crm: { label: 'CRM', color: 'bg-stone-light/20 text-stone-light' },
  fiscal: { label: 'Fiscal', color: 'bg-warm/10 text-warm' },
  rh: { label: 'RH', color: 'bg-stone/20 text-stone' },
}
