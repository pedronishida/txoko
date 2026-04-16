import type { Metadata } from 'next'
import Link from 'next/link'
import { WifiOff, ShoppingCart, Utensils, Eye } from 'lucide-react'
import { RetryButton } from './retry-button'

export const metadata: Metadata = {
  title: 'Offline',
}

const OFFLINE_FEATURES = [
  {
    icon: ShoppingCart,
    label: 'PDV',
    description:
      'Vendas registradas localmente e sincronizadas quando voltar online',
  },
  {
    icon: Utensils,
    label: 'KDS',
    description: 'Visualizacao de pedidos em cache (somente leitura)',
  },
  {
    icon: Eye,
    label: 'Pedidos recentes',
    description: 'Historico de pedidos carregado antes de ficar offline',
  },
] as const

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Icone principal */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-warning/10 mb-6">
          <WifiOff size={28} className="text-warning" strokeWidth={1.5} />
        </div>

        {/* Titulo */}
        <h1 className="text-[22px] font-semibold text-foreground tracking-tight mb-2">
          Voce esta offline
        </h1>
        <p className="text-[14px] text-muted-foreground tracking-tight leading-relaxed mb-8">
          Sem conexao com a internet. Algumas funcoes continuam disponiveis.
        </p>

        {/* Funcoes offline */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden mb-6 text-left">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Disponivel offline
            </p>
          </div>
          <ul className="divide-y divide-border">
            {OFFLINE_FEATURES.map(({ icon: Icon, label, description }) => (
              <li key={label} className="flex items-start gap-3 px-4 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={14} className="text-primary" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground tracking-tight">
                    {label}
                  </p>
                  <p className="text-[12px] text-muted-foreground tracking-tight leading-relaxed mt-0.5">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Acoes */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/pdv"
            className="flex-1 h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-[13px] font-medium tracking-tight hover:bg-primary-hover transition-colors"
          >
            Ir para o PDV
          </Link>
          <RetryButton />
        </div>
      </div>
    </div>
  )
}
