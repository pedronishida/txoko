export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const RESPONSES: Record<string, string> = {
  'vendas': '📊 **Vendas de hoje:** R$ 4.850,00 (+12,5% vs ontem)\n\n• 68 pedidos realizados\n• Ticket medio: R$ 71,32\n• Melhor horario: 12h-14h (42% das vendas)\n• Canal mais forte: Salao (58%), Delivery (32%), Retirada (10%)',
  'lucro': '💰 **Lucro do mes atual:** R$ 17.765,00\n\n• Receita bruta: R$ 111.940\n• CMV: R$ 35.820 (32%)\n• Despesas operacionais: R$ 48.200\n• Margem liquida: 15,9%\n\nSua margem esta acima da media do setor (12-15%). Parabens!',
  'prato': '🏆 **Top 5 pratos mais lucrativos:**\n\n1. Picanha na Brasa — margem 64,1% (R$ 57,04/un)\n2. Salmao Grelhado — margem 67,4% (R$ 52,56/un)\n3. Spaghetti Carbonara — margem 82,7% (R$ 43,00/un)\n4. Carpaccio de Carne — margem 61,2% (R$ 29,38/un)\n5. Risoto de Camarao — margem 51,4% (R$ 34,94/un)\n\n💡 Sugestao: Destaque o Spaghetti Carbonara no cardapio — maior margem com bom volume.',
  'estoque': '📦 **Alertas de estoque:**\n\n🔴 Criticos (abaixo do minimo):\n• Mozzarella de Bufala: 1,5kg (min: 2kg)\n• Tomate Italiano: 4kg (min: 5kg)\n• Rucula: 0,8kg (min: 1kg)\n• Camarao Limpo: 2kg (min: 2kg)\n\n⚠️ Sugestao: Enviar pedido urgente para Hortifruti Central e Laticinios Serra Dourada.',
  'garcom': '👤 **Performance dos garcons (mes atual):**\n\nComo estamos em modo demo, nao temos dados reais de garcons. Com o Supabase Auth configurado, cada garcom tera login proprio e o sistema rastreara:\n\n• Vendas por garcom\n• Ticket medio por garcom\n• Tempo de atendimento\n• Avaliacao dos clientes',
  'cliente': '👥 **Resumo de clientes:**\n\n• 10 clientes cadastrados\n• 3 VIPs (gasto > R$ 5.000)\n• 4 frequentes (10+ pedidos)\n• 3 inativos (30+ dias sem visita)\n\n💡 Sugestao: Enviar cupom de R$ 20 para Mariana Oliveira, Julia Ferreira e Gustavo Nascimento — estao inativos ha mais de 30 dias.',
  'previsao': '🔮 **Previsao para amanha:**\n\nBaseado no historico dos ultimos 30 dias:\n• Vendas estimadas: R$ 5.200 (+7% vs hoje)\n• Pedidos estimados: 73\n• Horario de pico: 12h-14h e 19h-21h\n\n📦 Prepare estoque extra de:\n• Picanha (+2kg)\n• Salmao (+1,5kg)\n• Tomate (+3kg)',
  'nps': '⭐ **NPS e Avaliacoes:**\n\n• NPS medio: 72 (Excelente)\n• Nota media: 4,3/5\n• Sentimento positivo: 67%\n• Principal elogio: qualidade da comida\n• Principal reclamacao: tempo de espera\n\n💡 Sugestao: Investir em KDS com priorizacao inteligente para reduzir tempo de preparo.',
}

export function getAIResponse(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('vend') || lower.includes('faturamento') || lower.includes('receita')) return RESPONSES['vendas']
  if (lower.includes('lucr') || lower.includes('margem') || lower.includes('resultado')) return RESPONSES['lucro']
  if (lower.includes('prato') || lower.includes('produto') || lower.includes('cardapio') || lower.includes('lucrativ')) return RESPONSES['prato']
  if (lower.includes('estoqu') || lower.includes('insumo') || lower.includes('ingrediente')) return RESPONSES['estoque']
  if (lower.includes('garcom') || lower.includes('garçom') || lower.includes('funcionario') || lower.includes('equipe')) return RESPONSES['garcom']
  if (lower.includes('client') || lower.includes('vip') || lower.includes('fidelid')) return RESPONSES['cliente']
  if (lower.includes('previs') || lower.includes('amanha') || lower.includes('demanda') || lower.includes('projeç')) return RESPONSES['previsao']
  if (lower.includes('nps') || lower.includes('avalia') || lower.includes('sentimento') || lower.includes('nota')) return RESPONSES['nps']

  return '🤖 Posso te ajudar com informacoes sobre:\n\n• **Vendas** — faturamento, pedidos, ticket medio\n• **Lucro** — margem, DRE, resultado\n• **Pratos** — mais lucrativos, mais vendidos\n• **Estoque** — alertas, previsao de compra\n• **Clientes** — VIPs, inativos, fidelidade\n• **Previsao** — demanda para amanha\n• **NPS** — avaliacoes, sentimento\n\nPergunta qualquer coisa em linguagem natural!'
}

export const QUICK_SUGGESTIONS = [
  'Qual meu prato mais lucrativo?',
  'Como estao as vendas hoje?',
  'Tem algum alerta de estoque?',
  'Qual a previsao para amanha?',
  'Como esta o NPS?',
  'Quais clientes estao inativos?',
]
