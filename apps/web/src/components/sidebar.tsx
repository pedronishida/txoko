'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Armchair,
  DollarSign,
  Package,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Monitor,
  ChefHat,
  Sparkles,
  Zap,
  Star,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'PDV', href: '/dashboard/pdv', icon: Monitor },
  { name: 'Pedidos', href: '/dashboard/pedidos', icon: ClipboardList },
  { name: 'KDS', href: '/dashboard/kds', icon: ChefHat },
  { name: 'Cardapio', href: '/dashboard/cardapio', icon: UtensilsCrossed },
  { name: 'Mesas', href: '/dashboard/mesas', icon: Armchair },
  { name: 'Financeiro', href: '/dashboard/financeiro', icon: DollarSign },
  { name: 'Estoque', href: '/dashboard/estoque', icon: Package },
  { name: 'Clientes', href: '/dashboard/clientes', icon: Users },
  { name: 'Avaliacoes', href: '/dashboard/avaliacoes', icon: Star },
  { name: 'Assistente IA', href: '/dashboard/assistente', icon: Sparkles },
  { name: 'Automacoes', href: '/dashboard/automacoes', icon: Zap },
  { name: 'Configuracoes', href: '/dashboard/configuracoes', icon: Settings },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-night-light border-r border-night-lighter flex flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <div className="flex items-center justify-between h-14 px-4 border-b border-night-lighter">
        {!collapsed && (
          <Link href="/dashboard" className="text-xl font-bold text-cloud tracking-tight">
            txoko
          </Link>
        )}
        <button
          onClick={onToggle}
          className={cn(
            'p-1.5 rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors',
            collapsed && 'mx-auto'
          )}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-leaf/10 text-leaf'
                  : 'text-stone-light hover:text-cloud hover:bg-night-lighter',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon size={20} className="shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-night-lighter">
        {!collapsed && (
          <div className="flex items-center gap-2 px-2">
            <div className="w-8 h-8 rounded-full bg-leaf/20 flex items-center justify-center text-leaf text-sm font-bold">
              T
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-cloud truncate">Txoko Demo</p>
              <p className="text-xs text-stone truncate">Plano Pro</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full bg-leaf/20 flex items-center justify-center text-leaf text-sm font-bold">
              T
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
