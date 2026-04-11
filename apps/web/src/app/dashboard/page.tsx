import { DollarSign, ShoppingBag, Receipt, Armchair, TrendingUp, TrendingDown } from 'lucide-react'

const metrics = [
  {
    label: 'Vendas Hoje',
    value: 'R$ 4.850,00',
    change: '+12.5%',
    trend: 'up' as const,
    icon: DollarSign,
  },
  {
    label: 'Pedidos',
    value: '68',
    change: '+8.3%',
    trend: 'up' as const,
    icon: ShoppingBag,
  },
  {
    label: 'Ticket Medio',
    value: 'R$ 71,32',
    change: '-2.1%',
    trend: 'down' as const,
    icon: Receipt,
  },
  {
    label: 'Mesas Ocupadas',
    value: '12 / 20',
    change: '60%',
    trend: 'up' as const,
    icon: Armchair,
  },
]

const recentOrders = [
  { id: '#1247', table: 'Mesa 5', items: 3, total: 'R$ 142,00', status: 'Preparando', time: '5 min' },
  { id: '#1246', table: 'Mesa 12', items: 2, total: 'R$ 89,50', status: 'Pronto', time: '12 min' },
  { id: '#1245', table: 'Delivery', items: 4, total: 'R$ 198,00', status: 'Saiu para entrega', time: '18 min' },
  { id: '#1244', table: 'Mesa 3', items: 1, total: 'R$ 35,00', status: 'Entregue', time: '25 min' },
  { id: '#1243', table: 'Mesa 8', items: 5, total: 'R$ 267,00', status: 'Preparando', time: '3 min' },
]

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'Preparando': 'bg-warm/10 text-warm',
    'Pronto': 'bg-leaf/10 text-leaf',
    'Saiu para entrega': 'bg-leaf/10 text-leaf',
    'Entregue': 'bg-stone/20 text-stone-light',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-stone/20 text-stone-light'}`}>
      {status}
    </span>
  )
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cloud">Dashboard</h1>
        <p className="text-sm text-stone mt-1">Visao geral do seu restaurante</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="bg-night-light border border-night-lighter rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-stone">{metric.label}</span>
              <div className="p-2 rounded-lg bg-night">
                <metric.icon size={16} className="text-stone-light" />
              </div>
            </div>
            <p className="text-2xl font-bold text-cloud font-data">{metric.value}</p>
            <div className="flex items-center gap-1 mt-1">
              {metric.trend === 'up' ? (
                <TrendingUp size={14} className="text-leaf" />
              ) : (
                <TrendingDown size={14} className="text-coral" />
              )}
              <span className={`text-xs font-medium font-data ${metric.trend === 'up' ? 'text-leaf' : 'text-coral'}`}>
                {metric.change}
              </span>
              <span className="text-xs text-stone">vs ontem</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="px-5 py-4 border-b border-night-lighter">
          <h2 className="font-semibold text-cloud">Pedidos Recentes</h2>
        </div>
        <div className="divide-y divide-night-lighter">
          {recentOrders.map((order) => (
            <div key={order.id} className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-data text-leaf font-medium">{order.id}</span>
                <span className="text-sm text-cloud">{order.table}</span>
                <span className="text-xs text-stone">{order.items} itens</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-data text-cloud">{order.total}</span>
                <StatusBadge status={order.status} />
                <span className="text-xs text-stone font-data w-12 text-right">{order.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
