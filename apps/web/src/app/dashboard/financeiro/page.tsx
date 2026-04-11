'use client'

import { formatCurrency } from '@/lib/utils'
import { DAILY_SALES, PAYMENT_BREAKDOWN, TOP_PRODUCTS, DRE_DATA } from '@/lib/mock-financial'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, PieChart, BarChart3 } from 'lucide-react'

const kpis = [
  { label: 'Receita do Mes', value: DRE_DATA.receita_bruta, change: '+8.2%', trend: 'up' as const, icon: DollarSign },
  { label: 'Despesas', value: DRE_DATA.total_despesas + DRE_DATA.custo_mercadorias, change: '+3.1%', trend: 'up' as const, icon: ShoppingCart },
  { label: 'Lucro Liquido', value: DRE_DATA.lucro_liquido, change: '+15.4%', trend: 'up' as const, icon: TrendingUp },
  { label: 'CMV', value: DRE_DATA.custo_mercadorias, change: '-2.3%', trend: 'down' as const, icon: PieChart },
]

const dreRows = [
  { label: 'Receita Bruta', value: DRE_DATA.receita_bruta, bold: true, indent: 0 },
  { label: '(-) Deducoes e Impostos', value: -DRE_DATA.deducoes_impostos, bold: false, indent: 1 },
  { label: '= Receita Liquida', value: DRE_DATA.receita_liquida, bold: true, indent: 0 },
  { label: '(-) Custo das Mercadorias (CMV)', value: -DRE_DATA.custo_mercadorias, bold: false, indent: 1 },
  { label: '= Lucro Bruto', value: DRE_DATA.lucro_bruto, bold: true, indent: 0 },
  { label: '(-) Pessoal', value: -DRE_DATA.despesas_pessoal, bold: false, indent: 1 },
  { label: '(-) Aluguel', value: -DRE_DATA.despesas_aluguel, bold: false, indent: 1 },
  { label: '(-) Operacional', value: -DRE_DATA.despesas_operacionais, bold: false, indent: 1 },
  { label: '(-) Marketing', value: -DRE_DATA.despesas_marketing, bold: false, indent: 1 },
  { label: '(-) Outras Despesas', value: -DRE_DATA.despesas_outras, bold: false, indent: 1 },
  { label: '= Lucro Operacional', value: DRE_DATA.lucro_operacional, bold: true, indent: 0 },
  { label: '(-) Despesas Financeiras', value: -DRE_DATA.despesas_financeiras, bold: false, indent: 1 },
  { label: '= Lucro Liquido', value: DRE_DATA.lucro_liquido, bold: true, indent: 0, highlight: true },
]

export default function FinanceiroPage() {
  const maxRevenue = Math.max(...DAILY_SALES.map(d => Math.max(d.revenue, d.expenses)))

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-night-light border border-night-lighter rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-stone">{kpi.label}</span>
              <div className="p-2 rounded-lg bg-night">
                <kpi.icon size={16} className="text-stone-light" />
              </div>
            </div>
            <p className="text-2xl font-bold text-cloud font-data">{formatCurrency(kpi.value)}</p>
            <div className="flex items-center gap-1 mt-1">
              {kpi.trend === 'up' ? (
                <TrendingUp size={14} className={kpi.label === 'Despesas' ? 'text-coral' : 'text-leaf'} />
              ) : (
                <TrendingDown size={14} className="text-leaf" />
              )}
              <span className={`text-xs font-medium font-data ${
                kpi.label === 'Despesas' ? 'text-coral' : kpi.trend === 'up' ? 'text-leaf' : 'text-leaf'
              }`}>
                {kpi.change}
              </span>
              <span className="text-xs text-stone">vs mes anterior</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cash Flow Chart */}
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-4 border-b border-night-lighter flex items-center gap-2">
            <BarChart3 size={16} className="text-stone-light" />
            <h2 className="font-semibold text-cloud text-sm">Fluxo de Caixa — Ultimos 7 dias</h2>
          </div>
          <div className="p-5">
            <div className="flex items-end gap-2 h-40">
              {DAILY_SALES.map((day, i) => {
                const revenueHeight = (day.revenue / maxRevenue) * 100
                const expenseHeight = (day.expenses / maxRevenue) * 100
                const dayName = new Date(day.date).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end gap-0.5 h-32">
                      <div
                        className="flex-1 bg-leaf/20 rounded-t-sm"
                        style={{ height: `${revenueHeight}%` }}
                        title={`Receita: ${formatCurrency(day.revenue)}`}
                      />
                      <div
                        className="flex-1 bg-coral/20 rounded-t-sm"
                        style={{ height: `${expenseHeight}%` }}
                        title={`Despesa: ${formatCurrency(day.expenses)}`}
                      />
                    </div>
                    <span className="text-[10px] text-stone capitalize">{dayName}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 justify-center">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-leaf/20" />
                <span className="text-[10px] text-stone">Receita</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-coral/20" />
                <span className="text-[10px] text-stone">Despesa</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Breakdown */}
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-4 border-b border-night-lighter flex items-center gap-2">
            <PieChart size={16} className="text-stone-light" />
            <h2 className="font-semibold text-cloud text-sm">Vendas por Forma de Pagamento</h2>
          </div>
          <div className="p-5 space-y-3">
            {PAYMENT_BREAKDOWN.map(item => (
              <div key={item.method}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-cloud">{item.method}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-data text-cloud">{formatCurrency(item.amount)}</span>
                    <span className="text-xs font-data text-stone">{item.percentage}%</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-night rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      item.color === 'leaf' ? 'bg-leaf/60' :
                      item.color === 'warm' ? 'bg-warm/60' :
                      item.color === 'stone-light' ? 'bg-stone-light/40' :
                      'bg-cloud/30'
                    }`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* DRE */}
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-4 border-b border-night-lighter">
            <h2 className="font-semibold text-cloud text-sm">DRE Simplificado — Mes Atual</h2>
          </div>
          <div className="divide-y divide-night-lighter">
            {dreRows.map((row, i) => (
              <div
                key={i}
                className={`px-5 py-2 flex items-center justify-between ${
                  (row as typeof row & { highlight?: boolean }).highlight ? 'bg-leaf/5' : ''
                }`}
              >
                <span
                  className={`text-sm ${row.bold ? 'font-semibold text-cloud' : 'text-stone-light'}`}
                  style={{ paddingLeft: `${row.indent * 16}px` }}
                >
                  {row.label}
                </span>
                <span className={`text-sm font-data ${
                  (row as typeof row & { highlight?: boolean }).highlight ? 'text-leaf font-bold' :
                  row.value < 0 ? 'text-coral' :
                  row.bold ? 'text-cloud font-semibold' :
                  'text-stone-light'
                }`}>
                  {row.value < 0 ? `(${formatCurrency(Math.abs(row.value))})` : formatCurrency(row.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-4 border-b border-night-lighter">
            <h2 className="font-semibold text-cloud text-sm">Top 5 Produtos — Mes Atual</h2>
          </div>
          <div className="divide-y divide-night-lighter">
            {TOP_PRODUCTS.map((product, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-leaf/20 text-leaf' :
                  i === 1 ? 'bg-warm/20 text-warm' :
                  'bg-night-lighter text-stone'
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cloud truncate">{product.name}</p>
                  <p className="text-xs text-stone font-data">{product.quantity} vendidos</p>
                </div>
                <span className="text-sm font-data font-semibold text-cloud">{formatCurrency(product.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
