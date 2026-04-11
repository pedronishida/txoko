import type { Review } from '@txoko/shared'

const now = new Date()
function dAgo(d: number) { return new Date(now.getTime() - d * 86400000).toISOString() }

export const MOCK_REVIEWS: Review[] = [
  { id: 'rev-1', restaurant_id: 'rest-1', order_id: 'order-1', customer_id: 'cust-1', rating: 5, nps: 10, comment: 'Comida incrivel! Melhor risoto de camarao que ja comi. Atendimento impecavel.', sentiment: 'positive', is_anonymous: false, source: 'internal', created_at: dAgo(0) },
  { id: 'rev-2', restaurant_id: 'rest-1', order_id: 'order-2', customer_id: 'cust-4', rating: 4, nps: 8, comment: 'Picanha sempre perfeita. Demora um pouco mas vale a pena.', sentiment: 'positive', is_anonymous: false, source: 'internal', created_at: dAgo(1) },
  { id: 'rev-3', restaurant_id: 'rest-1', order_id: null, customer_id: null, rating: 3, nps: 5, comment: 'Comida boa, mas o tempo de espera foi longo. 40 minutos para um prato simples.', sentiment: 'neutral', is_anonymous: true, source: 'google', created_at: dAgo(2) },
  { id: 'rev-4', restaurant_id: 'rest-1', order_id: 'order-5', customer_id: 'cust-2', rating: 5, nps: 9, comment: 'Ambiente agradavel, carta de vinhos excelente. Voltarei com certeza!', sentiment: 'positive', is_anonymous: false, source: 'internal', created_at: dAgo(3) },
  { id: 'rev-5', restaurant_id: 'rest-1', order_id: null, customer_id: null, rating: 2, nps: 3, comment: 'Delivery chegou frio e com item errado. Decepcionante.', sentiment: 'negative', is_anonymous: true, source: 'ifood', created_at: dAgo(4) },
  { id: 'rev-6', restaurant_id: 'rest-1', order_id: 'order-3', customer_id: 'cust-3', rating: 4, nps: 8, comment: 'Carbonara muito boa. Porcao generosa.', sentiment: 'positive', is_anonymous: false, source: 'internal', created_at: dAgo(5) },
  { id: 'rev-7', restaurant_id: 'rest-1', order_id: null, customer_id: null, rating: 5, nps: 10, comment: 'Melhor restaurante do bairro! Tudo perfeito.', sentiment: 'positive', is_anonymous: false, source: 'google', created_at: dAgo(6) },
  { id: 'rev-8', restaurant_id: 'rest-1', order_id: null, customer_id: 'cust-8', rating: 3, nps: 6, comment: 'Sabor bom mas achei caro para o tamanho da porcao.', sentiment: 'neutral', is_anonymous: false, source: 'internal', created_at: dAgo(8) },
  { id: 'rev-9', restaurant_id: 'rest-1', order_id: null, customer_id: null, rating: 1, nps: 1, comment: 'Encontrei cabelo na comida. Inaceitavel. Nao volto mais.', sentiment: 'negative', is_anonymous: true, source: 'google', created_at: dAgo(10) },
  { id: 'rev-10', restaurant_id: 'rest-1', order_id: null, customer_id: 'cust-6', rating: 5, nps: 10, comment: 'Evento corporativo impecavel. Equipe muito atenciosa. Menu personalizado top.', sentiment: 'positive', is_anonymous: false, source: 'internal', created_at: dAgo(12) },
  { id: 'rev-11', restaurant_id: 'rest-1', order_id: null, customer_id: null, rating: 4, nps: 7, comment: 'Comida muito boa, so precisa melhorar a musica do ambiente.', sentiment: 'positive', is_anonymous: true, source: 'internal', created_at: dAgo(13) },
  { id: 'rev-12', restaurant_id: 'rest-1', order_id: null, customer_id: 'cust-9', rating: 4, nps: 8, comment: 'Opcoes sem gluten excelentes! Obrigada por pensarem em nos.', sentiment: 'positive', is_anonymous: false, source: 'internal', created_at: dAgo(14) },
]
