import type { Category, Product, Table, Order, OrderItem, Ingredient, Supplier, Customer } from '@txoko/shared'

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-1', restaurant_id: 'rest-1', name: 'Entradas', sort_order: 0, is_active: true },
  { id: 'cat-2', restaurant_id: 'rest-1', name: 'Pratos Principais', sort_order: 1, is_active: true },
  { id: 'cat-3', restaurant_id: 'rest-1', name: 'Massas', sort_order: 2, is_active: true },
  { id: 'cat-4', restaurant_id: 'rest-1', name: 'Grelhados', sort_order: 3, is_active: true },
  { id: 'cat-5', restaurant_id: 'rest-1', name: 'Sobremesas', sort_order: 4, is_active: true },
  { id: 'cat-6', restaurant_id: 'rest-1', name: 'Bebidas', sort_order: 5, is_active: true },
  { id: 'cat-7', restaurant_id: 'rest-1', name: 'Cervejas', sort_order: 6, is_active: true },
  { id: 'cat-8', restaurant_id: 'rest-1', name: 'Vinhos', sort_order: 7, is_active: true },
]

export const MOCK_PRODUCTS: Product[] = [
  // Entradas
  { id: 'prod-1', restaurant_id: 'rest-1', category_id: 'cat-1', name: 'Bruschetta Caprese', description: 'Tomate, mozzarella de bufala, manjericao fresco e azeite extra virgem', price: 32.00, cost: 8.50, image_url: null, is_active: true, prep_time_minutes: 10, allergens: ['gluten', 'lactose'], tags: ['vegetariano'], sort_order: 0, created_at: '', updated_at: '' },
  { id: 'prod-2', restaurant_id: 'rest-1', category_id: 'cat-1', name: 'Ceviche de Peixe Branco', description: 'Peixe branco marinado em limao, cebola roxa, coentro e pimenta', price: 42.00, cost: 14.00, image_url: null, is_active: true, prep_time_minutes: 5, allergens: ['peixe'], tags: ['sem gluten'], sort_order: 1, created_at: '', updated_at: '' },
  { id: 'prod-3', restaurant_id: 'rest-1', category_id: 'cat-1', name: 'Bolinho de Bacalhau (6 un)', description: 'Bolinhos crocantes de bacalhau com azeitonas pretas', price: 38.00, cost: 12.00, image_url: null, is_active: true, prep_time_minutes: 15, allergens: ['gluten', 'peixe', 'ovo'], tags: [], sort_order: 2, created_at: '', updated_at: '' },
  { id: 'prod-4', restaurant_id: 'rest-1', category_id: 'cat-1', name: 'Carpaccio de Carne', description: 'Fatias finas de filé mignon com rúcula, parmesão e alcaparras', price: 48.00, cost: 18.00, image_url: null, is_active: true, prep_time_minutes: 8, allergens: ['lactose'], tags: ['sem gluten'], sort_order: 3, created_at: '', updated_at: '' },

  // Pratos Principais
  { id: 'prod-5', restaurant_id: 'rest-1', category_id: 'cat-2', name: 'Risoto de Camarao', description: 'Arroz arborio com camaroes, tomate seco, rucula e parmesao', price: 68.00, cost: 22.00, image_url: null, is_active: true, prep_time_minutes: 25, allergens: ['crustaceo', 'lactose'], tags: ['sem gluten'], sort_order: 0, created_at: '', updated_at: '' },
  { id: 'prod-6', restaurant_id: 'rest-1', category_id: 'cat-2', name: 'Salmao Grelhado', description: 'Filé de salmao com legumes assados e molho de maracuja', price: 78.00, cost: 28.00, image_url: null, is_active: true, prep_time_minutes: 20, allergens: ['peixe'], tags: ['sem gluten'], sort_order: 1, created_at: '', updated_at: '' },
  { id: 'prod-7', restaurant_id: 'rest-1', category_id: 'cat-2', name: 'Frango ao Molho Mostarda', description: 'Peito de frango grelhado com molho de mostarda dijon e batatas rusticas', price: 52.00, cost: 15.00, image_url: null, is_active: true, prep_time_minutes: 20, allergens: ['mostarda'], tags: [], sort_order: 2, created_at: '', updated_at: '' },

  // Massas
  { id: 'prod-8', restaurant_id: 'rest-1', category_id: 'cat-3', name: 'Spaghetti alla Carbonara', description: 'Massa al dente com guanciale, ovo, pecorino e pimenta preta', price: 52.00, cost: 14.00, image_url: null, is_active: true, prep_time_minutes: 18, allergens: ['gluten', 'ovo', 'lactose'], tags: [], sort_order: 0, created_at: '', updated_at: '' },
  { id: 'prod-9', restaurant_id: 'rest-1', category_id: 'cat-3', name: 'Penne ao Pesto', description: 'Penne com pesto de manjericao, pinoli e parmesao', price: 46.00, cost: 12.00, image_url: null, is_active: true, prep_time_minutes: 15, allergens: ['gluten', 'lactose', 'nozes'], tags: ['vegetariano'], sort_order: 1, created_at: '', updated_at: '' },
  { id: 'prod-10', restaurant_id: 'rest-1', category_id: 'cat-3', name: 'Lasanha Bolonhesa', description: 'Camadas de massa, ragu bolonhesa, bechamel e mozzarella gratinada', price: 56.00, cost: 16.00, image_url: null, is_active: true, prep_time_minutes: 30, allergens: ['gluten', 'lactose', 'ovo'], tags: [], sort_order: 2, created_at: '', updated_at: '' },

  // Grelhados
  { id: 'prod-11', restaurant_id: 'rest-1', category_id: 'cat-4', name: 'Picanha na Brasa (400g)', description: 'Picanha grelhada com farofa, vinagrete e arroz', price: 89.00, cost: 32.00, image_url: null, is_active: true, prep_time_minutes: 25, allergens: [], tags: ['sem gluten'], sort_order: 0, created_at: '', updated_at: '' },
  { id: 'prod-12', restaurant_id: 'rest-1', category_id: 'cat-4', name: 'Costela no Bafo', description: 'Costela bovina cozida lentamente por 8 horas com mandioca', price: 72.00, cost: 24.00, image_url: null, is_active: true, prep_time_minutes: 15, allergens: [], tags: ['sem gluten'], sort_order: 1, created_at: '', updated_at: '' },

  // Sobremesas
  { id: 'prod-13', restaurant_id: 'rest-1', category_id: 'cat-5', name: 'Petit Gateau', description: 'Bolo de chocolate com centro cremoso e sorvete de baunilha', price: 34.00, cost: 9.00, image_url: null, is_active: true, prep_time_minutes: 12, allergens: ['gluten', 'lactose', 'ovo'], tags: [], sort_order: 0, created_at: '', updated_at: '' },
  { id: 'prod-14', restaurant_id: 'rest-1', category_id: 'cat-5', name: 'Cheesecake de Frutas Vermelhas', description: 'Cheesecake cremoso com calda de frutas vermelhas', price: 30.00, cost: 8.00, image_url: null, is_active: true, prep_time_minutes: 5, allergens: ['gluten', 'lactose', 'ovo'], tags: [], sort_order: 1, created_at: '', updated_at: '' },

  // Bebidas
  { id: 'prod-15', restaurant_id: 'rest-1', category_id: 'cat-6', name: 'Suco Natural (500ml)', description: 'Laranja, limao, abacaxi, maracuja ou melancia', price: 14.00, cost: 4.00, image_url: null, is_active: true, prep_time_minutes: 3, allergens: [], tags: ['vegano'], sort_order: 0, created_at: '', updated_at: '' },
  { id: 'prod-16', restaurant_id: 'rest-1', category_id: 'cat-6', name: 'Refrigerante Lata', description: 'Coca-Cola, Guarana, Sprite ou Fanta', price: 8.00, cost: 3.00, image_url: null, is_active: true, prep_time_minutes: 1, allergens: [], tags: [], sort_order: 1, created_at: '', updated_at: '' },
  { id: 'prod-17', restaurant_id: 'rest-1', category_id: 'cat-6', name: 'Agua Mineral (500ml)', description: 'Com ou sem gas', price: 6.00, cost: 1.50, image_url: null, is_active: true, prep_time_minutes: 1, allergens: [], tags: [], sort_order: 2, created_at: '', updated_at: '' },
  { id: 'prod-18', restaurant_id: 'rest-1', category_id: 'cat-6', name: 'Cafe Espresso', description: 'Espresso curto ou longo', price: 8.00, cost: 2.00, image_url: null, is_active: true, prep_time_minutes: 2, allergens: [], tags: ['vegano'], sort_order: 3, created_at: '', updated_at: '' },

  // Cervejas
  { id: 'prod-19', restaurant_id: 'rest-1', category_id: 'cat-7', name: 'Chopp Pilsen (300ml)', description: 'Chopp artesanal tipo Pilsen', price: 14.00, cost: 5.00, image_url: null, is_active: true, prep_time_minutes: 1, allergens: ['gluten'], tags: [], sort_order: 0, created_at: '', updated_at: '' },
  { id: 'prod-20', restaurant_id: 'rest-1', category_id: 'cat-7', name: 'IPA Artesanal (350ml)', description: 'India Pale Ale com notas citricas', price: 22.00, cost: 8.00, image_url: null, is_active: true, prep_time_minutes: 1, allergens: ['gluten'], tags: [], sort_order: 1, created_at: '', updated_at: '' },

  // Vinhos
  { id: 'prod-21', restaurant_id: 'rest-1', category_id: 'cat-8', name: 'Taca de Malbec', description: 'Vinho tinto argentino, encorpado', price: 28.00, cost: 10.00, image_url: null, is_active: true, prep_time_minutes: 1, allergens: [], tags: [], sort_order: 0, created_at: '', updated_at: '' },
  { id: 'prod-22', restaurant_id: 'rest-1', category_id: 'cat-8', name: 'Taca de Sauvignon Blanc', description: 'Vinho branco chileno, seco e refrescante', price: 26.00, cost: 9.00, image_url: null, is_active: true, prep_time_minutes: 1, allergens: [], tags: [], sort_order: 1, created_at: '', updated_at: '' },
]

export const MOCK_TABLES: Table[] = Array.from({ length: 20 }, (_, i) => ({
  id: `table-${i + 1}`,
  restaurant_id: 'rest-1',
  number: i + 1,
  capacity: [2, 4, 4, 6, 4, 2, 4, 8, 4, 2, 6, 4, 2, 4, 4, 6, 2, 4, 8, 4][i],
  status: (['available', 'available', 'occupied', 'available', 'occupied', 'available', 'reserved', 'occupied', 'available', 'available', 'cleaning', 'occupied', 'available', 'available', 'occupied', 'available', 'available', 'reserved', 'available', 'available'] as const)[i],
  position_x: (i % 5) * 1,
  position_y: Math.floor(i / 5) * 1,
  area: i < 15 ? 'main' : 'terrace',
  current_order_id: null,
  occupied_at: null,
}))

const now = new Date()
function minutesAgo(min: number) {
  return new Date(now.getTime() - min * 60000).toISOString()
}

export const MOCK_ORDERS: Order[] = [
  {
    id: 'order-1', restaurant_id: 'rest-1', table_id: 'table-3', customer_id: null, waiter_id: null,
    type: 'dine_in', status: 'preparing', subtotal: 142.00, discount: 0, service_fee: 14.20, delivery_fee: 0, total: 156.20,
    notes: null, source: 'pos', external_id: null, delivery_address: null, estimated_time: 25,
    created_at: minutesAgo(5), closed_at: null,
  },
  {
    id: 'order-2', restaurant_id: 'rest-1', table_id: 'table-5', customer_id: null, waiter_id: null,
    type: 'dine_in', status: 'preparing', subtotal: 89.50, discount: 0, service_fee: 8.95, delivery_fee: 0, total: 98.45,
    notes: null, source: 'pos', external_id: null, delivery_address: null, estimated_time: 20,
    created_at: minutesAgo(12), closed_at: null,
  },
  {
    id: 'order-3', restaurant_id: 'rest-1', table_id: null, customer_id: null, waiter_id: null,
    type: 'delivery', status: 'ready', subtotal: 198.00, discount: 0, service_fee: 0, delivery_fee: 12.00, total: 210.00,
    notes: 'Sem cebola no ceviche', source: 'ifood', external_id: 'IF-88234', delivery_address: null, estimated_time: 30,
    created_at: minutesAgo(18), closed_at: null,
  },
  {
    id: 'order-4', restaurant_id: 'rest-1', table_id: 'table-8', customer_id: null, waiter_id: null,
    type: 'dine_in', status: 'open', subtotal: 267.00, discount: 0, service_fee: 26.70, delivery_fee: 0, total: 293.70,
    notes: null, source: 'pos', external_id: null, delivery_address: null, estimated_time: 30,
    created_at: minutesAgo(3), closed_at: null,
  },
  {
    id: 'order-5', restaurant_id: 'rest-1', table_id: 'table-12', customer_id: null, waiter_id: null,
    type: 'dine_in', status: 'preparing', subtotal: 156.00, discount: 10.00, service_fee: 14.60, delivery_fee: 0, total: 160.60,
    notes: null, source: 'qrcode', external_id: null, delivery_address: null, estimated_time: 22,
    created_at: minutesAgo(8), closed_at: null,
  },
  {
    id: 'order-6', restaurant_id: 'rest-1', table_id: 'table-15', customer_id: null, waiter_id: null,
    type: 'dine_in', status: 'open', subtotal: 96.00, discount: 0, service_fee: 9.60, delivery_fee: 0, total: 105.60,
    notes: null, source: 'pos', external_id: null, delivery_address: null, estimated_time: 20,
    created_at: minutesAgo(1), closed_at: null,
  },
  {
    id: 'order-7', restaurant_id: 'rest-1', table_id: null, customer_id: null, waiter_id: null,
    type: 'delivery', status: 'preparing', subtotal: 124.00, discount: 0, service_fee: 0, delivery_fee: 9.90, total: 133.90,
    notes: 'Interfone 42', source: 'rappi', external_id: 'RP-55412', delivery_address: { street: 'Rua Augusta', number: '1200', neighborhood: 'Consolacao', city: 'Sao Paulo', state: 'SP', zip: '01304-001' } as any,
    estimated_time: 40, created_at: minutesAgo(10), closed_at: null,
  },
  {
    id: 'order-8', restaurant_id: 'rest-1', table_id: null, customer_id: null, waiter_id: null,
    type: 'delivery', status: 'open', subtotal: 78.00, discount: 0, service_fee: 0, delivery_fee: 7.50, total: 85.50,
    notes: null, source: 'whatsapp', external_id: null, delivery_address: { street: 'Av Paulista', number: '900', neighborhood: 'Bela Vista', city: 'Sao Paulo', state: 'SP', zip: '01310-100' } as any,
    estimated_time: 35, created_at: minutesAgo(2), closed_at: null,
  },
  {
    id: 'order-9', restaurant_id: 'rest-1', table_id: null, customer_id: null, waiter_id: null,
    type: 'takeaway', status: 'ready', subtotal: 52.00, discount: 0, service_fee: 0, delivery_fee: 0, total: 52.00,
    notes: null, source: 'website', external_id: null, delivery_address: null, estimated_time: 15,
    created_at: minutesAgo(20), closed_at: null,
  },
  {
    id: 'order-10', restaurant_id: 'rest-1', table_id: null, customer_id: null, waiter_id: null,
    type: 'delivery', status: 'delivered', subtotal: 210.00, discount: 15.00, service_fee: 0, delivery_fee: 12.00, total: 207.00,
    notes: null, source: 'ifood', external_id: 'IF-88190', delivery_address: { street: 'Rua Oscar Freire', number: '350', neighborhood: 'Jardins', city: 'Sao Paulo', state: 'SP', zip: '01426-001' } as any,
    estimated_time: 45, created_at: minutesAgo(55), closed_at: minutesAgo(15),
  },
]

export const MOCK_ORDER_ITEMS: Record<string, OrderItem[]> = {
  'order-1': [
    { id: 'oi-1', order_id: 'order-1', product_id: 'prod-1', quantity: 1, unit_price: 32.00, total_price: 32.00, notes: null, status: 'preparing', addons: [], sent_to_kitchen_at: minutesAgo(4), ready_at: null },
    { id: 'oi-2', order_id: 'order-1', product_id: 'prod-5', quantity: 1, unit_price: 68.00, total_price: 68.00, notes: 'Sem rucula', status: 'preparing', addons: [], sent_to_kitchen_at: minutesAgo(4), ready_at: null },
    { id: 'oi-3', order_id: 'order-1', product_id: 'prod-21', quantity: 2, unit_price: 28.00, total_price: 56.00, notes: null, status: 'ready', addons: [], sent_to_kitchen_at: minutesAgo(4), ready_at: minutesAgo(2) },
  ],
  'order-2': [
    { id: 'oi-4', order_id: 'order-2', product_id: 'prod-8', quantity: 1, unit_price: 52.00, total_price: 52.00, notes: null, status: 'preparing', addons: [], sent_to_kitchen_at: minutesAgo(10), ready_at: null },
    { id: 'oi-5', order_id: 'order-2', product_id: 'prod-19', quantity: 2, unit_price: 14.00, total_price: 28.00, notes: null, status: 'delivered', addons: [], sent_to_kitchen_at: minutesAgo(10), ready_at: minutesAgo(8) },
  ],
  'order-3': [
    { id: 'oi-6', order_id: 'order-3', product_id: 'prod-2', quantity: 1, unit_price: 42.00, total_price: 42.00, notes: 'Sem cebola', status: 'ready', addons: [], sent_to_kitchen_at: minutesAgo(16), ready_at: minutesAgo(4) },
    { id: 'oi-7', order_id: 'order-3', product_id: 'prod-6', quantity: 2, unit_price: 78.00, total_price: 156.00, notes: null, status: 'ready', addons: [], sent_to_kitchen_at: minutesAgo(16), ready_at: minutesAgo(2) },
  ],
  'order-4': [
    { id: 'oi-8', order_id: 'order-4', product_id: 'prod-4', quantity: 1, unit_price: 48.00, total_price: 48.00, notes: null, status: 'pending', addons: [], sent_to_kitchen_at: null, ready_at: null },
    { id: 'oi-9', order_id: 'order-4', product_id: 'prod-11', quantity: 2, unit_price: 89.00, total_price: 178.00, notes: 'Mal passada', status: 'pending', addons: [], sent_to_kitchen_at: null, ready_at: null },
    { id: 'oi-10', order_id: 'order-4', product_id: 'prod-20', quantity: 2, unit_price: 22.00, total_price: 44.00, notes: null, status: 'pending', addons: [], sent_to_kitchen_at: null, ready_at: null },
  ],
  'order-5': [
    { id: 'oi-11', order_id: 'order-5', product_id: 'prod-10', quantity: 2, unit_price: 56.00, total_price: 112.00, notes: null, status: 'preparing', addons: [], sent_to_kitchen_at: minutesAgo(6), ready_at: null },
    { id: 'oi-12', order_id: 'order-5', product_id: 'prod-16', quantity: 4, unit_price: 8.00, total_price: 32.00, notes: null, status: 'delivered', addons: [], sent_to_kitchen_at: minutesAgo(6), ready_at: minutesAgo(5) },
  ],
  'order-6': [
    { id: 'oi-13', order_id: 'order-6', product_id: 'prod-7', quantity: 1, unit_price: 52.00, total_price: 52.00, notes: null, status: 'pending', addons: [], sent_to_kitchen_at: null, ready_at: null },
    { id: 'oi-14', order_id: 'order-6', product_id: 'prod-9', quantity: 1, unit_price: 46.00, total_price: 46.00, notes: 'Sem pinoli', status: 'pending', addons: [], sent_to_kitchen_at: null, ready_at: null },
  ],
  'order-7': [
    { id: 'oi-15', order_id: 'order-7', product_id: 'prod-11', quantity: 1, unit_price: 89.00, total_price: 89.00, notes: 'Ao ponto', status: 'preparing', addons: [], sent_to_kitchen_at: minutesAgo(8), ready_at: null },
    { id: 'oi-16', order_id: 'order-7', product_id: 'prod-15', quantity: 2, unit_price: 14.00, total_price: 28.00, notes: 'Laranja', status: 'preparing', addons: [], sent_to_kitchen_at: minutesAgo(8), ready_at: null },
  ],
  'order-8': [
    { id: 'oi-17', order_id: 'order-8', product_id: 'prod-6', quantity: 1, unit_price: 78.00, total_price: 78.00, notes: null, status: 'pending', addons: [], sent_to_kitchen_at: null, ready_at: null },
  ],
  'order-9': [
    { id: 'oi-18', order_id: 'order-9', product_id: 'prod-8', quantity: 1, unit_price: 52.00, total_price: 52.00, notes: null, status: 'ready', addons: [], sent_to_kitchen_at: minutesAgo(18), ready_at: minutesAgo(5) },
  ],
  'order-10': [
    { id: 'oi-19', order_id: 'order-10', product_id: 'prod-5', quantity: 2, unit_price: 68.00, total_price: 136.00, notes: null, status: 'delivered', addons: [], sent_to_kitchen_at: minutesAgo(50), ready_at: minutesAgo(25) },
    { id: 'oi-20', order_id: 'order-10', product_id: 'prod-13', quantity: 2, unit_price: 34.00, total_price: 68.00, notes: null, status: 'delivered', addons: [], sent_to_kitchen_at: minutesAgo(50), ready_at: minutesAgo(25) },
  ],
}

// === SUPPLIERS ===
export const MOCK_SUPPLIERS: Supplier[] = [
  { id: 'sup-1', restaurant_id: 'rest-1', name: 'Distribuidora ABC Carnes', document: '12.345.678/0001-90', phone: '(11) 3456-7890', email: 'vendas@abccarnes.com', address: { street: 'Rua dos Acougues', number: '500', neighborhood: 'Lapa', city: 'Sao Paulo', state: 'SP', zip: '05065-000' }, notes: 'Entregas seg/qua/sex pela manha', created_at: '' },
  { id: 'sup-2', restaurant_id: 'rest-1', name: 'Hortifruti Central', document: '23.456.789/0001-01', phone: '(11) 2345-6789', email: 'pedidos@hortifruti.com', address: null, notes: 'Entregas diarias ate 7h', created_at: '' },
  { id: 'sup-3', restaurant_id: 'rest-1', name: 'Bebidas Premium Ltda', document: '34.567.890/0001-12', phone: '(11) 4567-8901', email: 'comercial@bebidaspremium.com', address: null, notes: 'Pedido minimo R$ 500', created_at: '' },
  { id: 'sup-4', restaurant_id: 'rest-1', name: 'Laticínios Serra Dourada', document: '45.678.901/0001-23', phone: '(11) 5678-9012', email: 'contato@serradourada.com', address: null, notes: 'Queijos artesanais, entrega semanal', created_at: '' },
  { id: 'sup-5', restaurant_id: 'rest-1', name: 'Pescados Oceano Azul', document: '56.789.012/0001-34', phone: '(11) 6789-0123', email: 'vendas@oceanoazul.com', address: null, notes: 'Peixes frescos, entrega ter/qui/sab', created_at: '' },
]

// === INGREDIENTS ===
export const MOCK_INGREDIENTS: Ingredient[] = [
  { id: 'ing-1', restaurant_id: 'rest-1', name: 'Filé Mignon', unit: 'kg', current_stock: 12.5, min_stock: 5, cost_per_unit: 89.90, supplier_id: 'sup-1', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-2', restaurant_id: 'rest-1', name: 'Picanha', unit: 'kg', current_stock: 8.0, min_stock: 4, cost_per_unit: 79.90, supplier_id: 'sup-1', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-3', restaurant_id: 'rest-1', name: 'Salmao Fresco', unit: 'kg', current_stock: 3.2, min_stock: 3, cost_per_unit: 98.00, supplier_id: 'sup-5', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-4', restaurant_id: 'rest-1', name: 'Camarao Limpo', unit: 'kg', current_stock: 2.0, min_stock: 2, cost_per_unit: 120.00, supplier_id: 'sup-5', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-5', restaurant_id: 'rest-1', name: 'Arroz Arborio', unit: 'kg', current_stock: 10, min_stock: 3, cost_per_unit: 28.00, supplier_id: null, storage_location: 'deposito', created_at: '', updated_at: '' },
  { id: 'ing-6', restaurant_id: 'rest-1', name: 'Massa Spaghetti', unit: 'kg', current_stock: 8, min_stock: 4, cost_per_unit: 12.00, supplier_id: null, storage_location: 'deposito', created_at: '', updated_at: '' },
  { id: 'ing-7', restaurant_id: 'rest-1', name: 'Mozzarella de Bufala', unit: 'kg', current_stock: 1.5, min_stock: 2, cost_per_unit: 85.00, supplier_id: 'sup-4', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-8', restaurant_id: 'rest-1', name: 'Parmesao Reggiano', unit: 'kg', current_stock: 3.0, min_stock: 1.5, cost_per_unit: 120.00, supplier_id: 'sup-4', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-9', restaurant_id: 'rest-1', name: 'Tomate Italiano', unit: 'kg', current_stock: 4.0, min_stock: 5, cost_per_unit: 8.50, supplier_id: 'sup-2', storage_location: 'cozinha', created_at: '', updated_at: '' },
  { id: 'ing-10', restaurant_id: 'rest-1', name: 'Rucula', unit: 'kg', current_stock: 0.8, min_stock: 1, cost_per_unit: 22.00, supplier_id: 'sup-2', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-11', restaurant_id: 'rest-1', name: 'Azeite Extra Virgem', unit: 'l', current_stock: 5.0, min_stock: 2, cost_per_unit: 45.00, supplier_id: null, storage_location: 'deposito', created_at: '', updated_at: '' },
  { id: 'ing-12', restaurant_id: 'rest-1', name: 'Vinho Tinto (cozinha)', unit: 'l', current_stock: 3.0, min_stock: 2, cost_per_unit: 35.00, supplier_id: 'sup-3', storage_location: 'bar', created_at: '', updated_at: '' },
  { id: 'ing-13', restaurant_id: 'rest-1', name: 'Chocolate 70%', unit: 'kg', current_stock: 2.0, min_stock: 1, cost_per_unit: 65.00, supplier_id: null, storage_location: 'deposito', created_at: '', updated_at: '' },
  { id: 'ing-14', restaurant_id: 'rest-1', name: 'Creme de Leite', unit: 'l', current_stock: 4.0, min_stock: 3, cost_per_unit: 18.00, supplier_id: 'sup-4', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-15', restaurant_id: 'rest-1', name: 'Bacalhau Dessalgado', unit: 'kg', current_stock: 2.5, min_stock: 2, cost_per_unit: 95.00, supplier_id: 'sup-5', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-16', restaurant_id: 'rest-1', name: 'Ovo Caipira', unit: 'un', current_stock: 48, min_stock: 30, cost_per_unit: 1.20, supplier_id: 'sup-2', storage_location: 'geladeira', created_at: '', updated_at: '' },
  { id: 'ing-17', restaurant_id: 'rest-1', name: 'Manteiga', unit: 'kg', current_stock: 3.0, min_stock: 2, cost_per_unit: 42.00, supplier_id: 'sup-4', storage_location: 'geladeira', created_at: '', updated_at: '' },
]

// === RECIPES (fichas tecnicas) ===
export interface Recipe {
  product_id: string
  ingredients: { ingredient_id: string; quantity: number; unit: string }[]
}

export const MOCK_RECIPES: Recipe[] = [
  { product_id: 'prod-1', ingredients: [ // Bruschetta Caprese
    { ingredient_id: 'ing-9', quantity: 0.15, unit: 'kg' },
    { ingredient_id: 'ing-7', quantity: 0.1, unit: 'kg' },
    { ingredient_id: 'ing-11', quantity: 0.02, unit: 'l' },
  ]},
  { product_id: 'prod-4', ingredients: [ // Carpaccio
    { ingredient_id: 'ing-1', quantity: 0.15, unit: 'kg' },
    { ingredient_id: 'ing-10', quantity: 0.03, unit: 'kg' },
    { ingredient_id: 'ing-8', quantity: 0.03, unit: 'kg' },
    { ingredient_id: 'ing-11', quantity: 0.02, unit: 'l' },
  ]},
  { product_id: 'prod-5', ingredients: [ // Risoto Camarao
    { ingredient_id: 'ing-5', quantity: 0.15, unit: 'kg' },
    { ingredient_id: 'ing-4', quantity: 0.2, unit: 'kg' },
    { ingredient_id: 'ing-8', quantity: 0.03, unit: 'kg' },
    { ingredient_id: 'ing-17', quantity: 0.03, unit: 'kg' },
  ]},
  { product_id: 'prod-6', ingredients: [ // Salmao Grelhado
    { ingredient_id: 'ing-3', quantity: 0.25, unit: 'kg' },
    { ingredient_id: 'ing-11', quantity: 0.02, unit: 'l' },
  ]},
  { product_id: 'prod-8', ingredients: [ // Carbonara
    { ingredient_id: 'ing-6', quantity: 0.15, unit: 'kg' },
    { ingredient_id: 'ing-16', quantity: 2, unit: 'un' },
    { ingredient_id: 'ing-8', quantity: 0.04, unit: 'kg' },
  ]},
  { product_id: 'prod-11', ingredients: [ // Picanha
    { ingredient_id: 'ing-2', quantity: 0.4, unit: 'kg' },
  ]},
  { product_id: 'prod-13', ingredients: [ // Petit Gateau
    { ingredient_id: 'ing-13', quantity: 0.08, unit: 'kg' },
    { ingredient_id: 'ing-17', quantity: 0.05, unit: 'kg' },
    { ingredient_id: 'ing-16', quantity: 2, unit: 'un' },
    { ingredient_id: 'ing-14', quantity: 0.05, unit: 'l' },
  ]},
]

// === CUSTOMERS ===
function daysAgo(days: number) {
  return new Date(now.getTime() - days * 86400000).toISOString()
}

export const MOCK_CUSTOMERS: Customer[] = [
  { id: 'cust-1', restaurant_id: 'rest-1', name: 'Ana Carolina Silva', phone: '(11) 99876-5432', email: 'ana.silva@gmail.com', document: null, birthday: '1988-03-15', address: null, notes: 'Vegetariana. Prefere mesa no terraco.', loyalty_points: 2450, total_orders: 28, total_spent: 3890.00, last_visit_at: daysAgo(2), created_at: daysAgo(180) },
  { id: 'cust-2', restaurant_id: 'rest-1', name: 'Ricardo Mendes', phone: '(11) 98765-4321', email: 'ricardo.m@hotmail.com', document: null, birthday: '1975-07-22', address: null, notes: 'Alergia a crustaceos. Cliente VIP.', loyalty_points: 4200, total_orders: 45, total_spent: 6780.00, last_visit_at: daysAgo(5), created_at: daysAgo(365) },
  { id: 'cust-3', restaurant_id: 'rest-1', name: 'Fernanda Costa', phone: '(11) 97654-3210', email: 'fer.costa@outlook.com', document: null, birthday: '1992-11-08', address: null, notes: null, loyalty_points: 890, total_orders: 12, total_spent: 1560.00, last_visit_at: daysAgo(10), created_at: daysAgo(90) },
  { id: 'cust-4', restaurant_id: 'rest-1', name: 'Carlos Eduardo Santos', phone: '(11) 96543-2109', email: null, document: null, birthday: null, address: null, notes: 'Sempre pede picanha mal passada', loyalty_points: 1800, total_orders: 22, total_spent: 2940.00, last_visit_at: daysAgo(1), created_at: daysAgo(150) },
  { id: 'cust-5', restaurant_id: 'rest-1', name: 'Mariana Oliveira', phone: '(11) 95432-1098', email: 'mari.oliveira@gmail.com', document: null, birthday: '1985-01-30', address: null, notes: 'Intolerante a lactose', loyalty_points: 320, total_orders: 5, total_spent: 480.00, last_visit_at: daysAgo(35), created_at: daysAgo(60) },
  { id: 'cust-6', restaurant_id: 'rest-1', name: 'Pedro Henrique Lima', phone: '(11) 94321-0987', email: 'pedro.lima@empresa.com', document: null, birthday: '1990-09-12', address: null, notes: 'Eventos corporativos frequentes', loyalty_points: 5600, total_orders: 52, total_spent: 8920.00, last_visit_at: daysAgo(3), created_at: daysAgo(400) },
  { id: 'cust-7', restaurant_id: 'rest-1', name: 'Julia Ferreira', phone: '(11) 93210-9876', email: 'julia.f@gmail.com', document: null, birthday: '1998-05-20', address: null, notes: null, loyalty_points: 150, total_orders: 2, total_spent: 210.00, last_visit_at: daysAgo(45), created_at: daysAgo(50) },
  { id: 'cust-8', restaurant_id: 'rest-1', name: 'Roberto Almeida', phone: '(11) 92109-8765', email: 'roberto.almeida@yahoo.com', document: null, birthday: '1970-12-03', address: null, notes: 'Prefere vinhos argentinos', loyalty_points: 3100, total_orders: 35, total_spent: 5200.00, last_visit_at: daysAgo(7), created_at: daysAgo(300) },
  { id: 'cust-9', restaurant_id: 'rest-1', name: 'Isabela Martins', phone: '(11) 91098-7654', email: 'isa.martins@gmail.com', document: null, birthday: '1995-08-18', address: null, notes: 'Sem gluten', loyalty_points: 680, total_orders: 8, total_spent: 920.00, last_visit_at: daysAgo(15), created_at: daysAgo(120) },
  { id: 'cust-10', restaurant_id: 'rest-1', name: 'Gustavo Nascimento', phone: '(11) 90987-6543', email: null, document: null, birthday: null, address: null, notes: null, loyalty_points: 50, total_orders: 1, total_spent: 89.00, last_visit_at: daysAgo(60), created_at: daysAgo(60) },
]
