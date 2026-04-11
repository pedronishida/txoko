import type { FinancialTransaction, Invoice } from '@txoko/shared'

const today = new Date()
function daysAgo(days: number) {
  const d = new Date(today)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}
function dateStr(days: number) {
  const d = new Date(today)
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

// Daily sales for last 7 days
export const DAILY_SALES = [
  { date: dateStr(6), revenue: 4280, expenses: 1850 },
  { date: dateStr(5), revenue: 5120, expenses: 2100 },
  { date: dateStr(4), revenue: 3890, expenses: 1720 },
  { date: dateStr(3), revenue: 6340, expenses: 2450 },
  { date: dateStr(2), revenue: 5780, expenses: 2200 },
  { date: dateStr(1), revenue: 4950, expenses: 1980 },
  { date: dateStr(0), revenue: 4850, expenses: 1900 },
]

// Payment method breakdown (current month)
export const PAYMENT_BREAKDOWN = [
  { method: 'Pix', amount: 42500, percentage: 38, color: 'leaf' },
  { method: 'Credito', amount: 33600, percentage: 30, color: 'warm' },
  { method: 'Debito', amount: 22400, percentage: 20, color: 'stone-light' },
  { method: 'Dinheiro', amount: 13440, percentage: 12, color: 'cloud' },
]

// Top products
export const TOP_PRODUCTS = [
  { name: 'Picanha na Brasa (400g)', quantity: 142, revenue: 12638 },
  { name: 'Risoto de Camarao', quantity: 98, revenue: 6664 },
  { name: 'Salmao Grelhado', quantity: 87, revenue: 6786 },
  { name: 'Chopp Pilsen (300ml)', quantity: 312, revenue: 4368 },
  { name: 'Spaghetti alla Carbonara', quantity: 76, revenue: 3952 },
]

// DRE data
export const DRE_DATA = {
  receita_bruta: 111940,
  deducoes_impostos: 8955,
  receita_liquida: 102985,
  custo_mercadorias: 35820,
  lucro_bruto: 67165,
  despesas_pessoal: 28000,
  despesas_aluguel: 8500,
  despesas_operacionais: 6200,
  despesas_marketing: 2400,
  despesas_outras: 3100,
  total_despesas: 48200,
  lucro_operacional: 18965,
  despesas_financeiras: 1200,
  lucro_liquido: 17765,
}

// Cash register movements
export interface CashMovement {
  id: string
  type: 'sale' | 'supply' | 'withdrawal' | 'expense'
  description: string
  amount: number
  method: string
  time: string
  order_id: string | null
}

export const MOCK_CASH_MOVEMENTS: CashMovement[] = [
  { id: 'cm-1', type: 'supply', description: 'Abertura de caixa', amount: 500, method: 'cash', time: '08:00', order_id: null },
  { id: 'cm-2', type: 'sale', description: 'Pedido #1238 — Mesa 5', amount: 142.00, method: 'credit', time: '12:15', order_id: 'order-1238' },
  { id: 'cm-3', type: 'sale', description: 'Pedido #1239 — Mesa 8', amount: 89.50, method: 'pix', time: '12:32', order_id: 'order-1239' },
  { id: 'cm-4', type: 'sale', description: 'Pedido #1240 — Delivery', amount: 198.00, method: 'online', time: '12:45', order_id: 'order-1240' },
  { id: 'cm-5', type: 'withdrawal', description: 'Sangria — deposito banco', amount: -300, method: 'cash', time: '14:00', order_id: null },
  { id: 'cm-6', type: 'sale', description: 'Pedido #1241 — Mesa 3', amount: 267.00, method: 'debit', time: '13:10', order_id: 'order-1241' },
  { id: 'cm-7', type: 'sale', description: 'Pedido #1242 — Balcao', amount: 35.00, method: 'pix', time: '13:25', order_id: 'order-1242' },
  { id: 'cm-8', type: 'expense', description: 'Compra gas — urgencia', amount: -180, method: 'cash', time: '14:30', order_id: null },
  { id: 'cm-9', type: 'sale', description: 'Pedido #1243 — Mesa 12', amount: 156.00, method: 'credit', time: '19:20', order_id: 'order-1243' },
  { id: 'cm-10', type: 'sale', description: 'Pedido #1244 — Mesa 7', amount: 312.00, method: 'pix', time: '19:45', order_id: 'order-1244' },
  { id: 'cm-11', type: 'sale', description: 'Pedido #1245 — Mesa 1', amount: 78.00, method: 'cash', time: '20:10', order_id: 'order-1245' },
  { id: 'cm-12', type: 'sale', description: 'Pedido #1246 — Delivery', amount: 145.00, method: 'online', time: '20:30', order_id: 'order-1246' },
]

// Financial transactions (contas a pagar/receber)
export const MOCK_TRANSACTIONS: FinancialTransaction[] = [
  // Contas a pagar
  { id: 'ft-1', restaurant_id: 'rest-1', type: 'expense', category: 'aluguel', description: 'Aluguel mensal — ponto comercial', amount: 8500, due_date: dateStr(-2), paid_at: daysAgo(2), status: 'paid', recurrence: 'monthly', payment_method: 'transfer', document_url: null, created_at: daysAgo(30) },
  { id: 'ft-2', restaurant_id: 'rest-1', type: 'expense', category: 'fornecedor', description: 'Distribuidora ABC — carnes', amount: 4200, due_date: dateStr(3), paid_at: null, status: 'pending', recurrence: null, payment_method: null, document_url: null, created_at: daysAgo(5) },
  { id: 'ft-3', restaurant_id: 'rest-1', type: 'expense', category: 'fornecedor', description: 'Hortifruti Central — verduras e legumes', amount: 1850, due_date: dateStr(5), paid_at: null, status: 'pending', recurrence: null, payment_method: null, document_url: null, created_at: daysAgo(3) },
  { id: 'ft-4', restaurant_id: 'rest-1', type: 'expense', category: 'utilidades', description: 'Conta de energia eletrica', amount: 2800, due_date: dateStr(-5), paid_at: null, status: 'overdue', recurrence: 'monthly', payment_method: null, document_url: null, created_at: daysAgo(35) },
  { id: 'ft-5', restaurant_id: 'rest-1', type: 'expense', category: 'pessoal', description: 'Folha de pagamento — cozinha', amount: 14000, due_date: dateStr(7), paid_at: null, status: 'pending', recurrence: 'monthly', payment_method: null, document_url: null, created_at: daysAgo(1) },
  { id: 'ft-6', restaurant_id: 'rest-1', type: 'expense', category: 'pessoal', description: 'Folha de pagamento — salao', amount: 12000, due_date: dateStr(7), paid_at: null, status: 'pending', recurrence: 'monthly', payment_method: null, document_url: null, created_at: daysAgo(1) },
  { id: 'ft-7', restaurant_id: 'rest-1', type: 'expense', category: 'fornecedor', description: 'Bebidas Premium Ltda — vinhos e cervejas', amount: 6700, due_date: dateStr(-1), paid_at: daysAgo(1), status: 'paid', recurrence: null, payment_method: 'pix', document_url: null, created_at: daysAgo(10) },
  { id: 'ft-8', restaurant_id: 'rest-1', type: 'expense', category: 'manutencao', description: 'Manutencao ar condicionado', amount: 850, due_date: dateStr(10), paid_at: null, status: 'pending', recurrence: null, payment_method: null, document_url: null, created_at: daysAgo(2) },
  { id: 'ft-9', restaurant_id: 'rest-1', type: 'expense', category: 'marketing', description: 'Meta Ads — campanha delivery', amount: 1200, due_date: dateStr(-3), paid_at: daysAgo(3), status: 'paid', recurrence: 'monthly', payment_method: 'credit', document_url: null, created_at: daysAgo(33) },
  { id: 'ft-10', restaurant_id: 'rest-1', type: 'expense', category: 'impostos', description: 'DAS Simples Nacional', amount: 4800, due_date: dateStr(12), paid_at: null, status: 'pending', recurrence: 'monthly', payment_method: null, document_url: null, created_at: daysAgo(1) },

  // Contas a receber
  { id: 'ft-11', restaurant_id: 'rest-1', type: 'income', category: 'cartao', description: 'Repasse Stone — credito', amount: 18500, due_date: dateStr(2), paid_at: null, status: 'pending', recurrence: null, payment_method: 'transfer', document_url: null, created_at: daysAgo(4) },
  { id: 'ft-12', restaurant_id: 'rest-1', type: 'income', category: 'cartao', description: 'Repasse Stone — debito', amount: 8200, due_date: dateStr(0), paid_at: daysAgo(0), status: 'paid', recurrence: null, payment_method: 'transfer', document_url: null, created_at: daysAgo(2) },
  { id: 'ft-13', restaurant_id: 'rest-1', type: 'income', category: 'delivery', description: 'Repasse iFood — semana 14', amount: 12400, due_date: dateStr(4), paid_at: null, status: 'pending', recurrence: null, payment_method: 'transfer', document_url: null, created_at: daysAgo(1) },
  { id: 'ft-14', restaurant_id: 'rest-1', type: 'income', category: 'evento', description: 'Reserva evento corporativo — 50% adiantado', amount: 5000, due_date: dateStr(-7), paid_at: daysAgo(7), status: 'paid', recurrence: null, payment_method: 'pix', document_url: null, created_at: daysAgo(15) },
  { id: 'ft-15', restaurant_id: 'rest-1', type: 'income', category: 'evento', description: 'Reserva evento corporativo — saldo', amount: 5000, due_date: dateStr(8), paid_at: null, status: 'pending', recurrence: null, payment_method: null, document_url: null, created_at: daysAgo(15) },
]

// Invoices (Notas Fiscais)
function generateAccessKey() {
  return Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('')
}

export const MOCK_INVOICES: Invoice[] = Array.from({ length: 15 }, (_, i) => ({
  id: `inv-${i + 1}`,
  restaurant_id: 'rest-1',
  order_id: `order-${1230 + i}`,
  type: (i % 5 === 0 ? 'nfe' : 'nfce') as 'nfce' | 'nfe' | 'sat',
  number: `${1000 + i}`,
  series: '1',
  access_key: generateAccessKey(),
  xml_url: `/storage/xml/nfce-${1000 + i}.xml`,
  pdf_url: `/storage/pdf/danfe-${1000 + i}.pdf`,
  status: i === 12 ? 'cancelled' : i === 14 ? 'pending' : 'authorized',
  sefaz_response: i === 14 ? null : { code: '100', message: 'Autorizado' },
  issued_at: i === 14 ? null : daysAgo(14 - i),
  created_at: daysAgo(14 - i),
}))
