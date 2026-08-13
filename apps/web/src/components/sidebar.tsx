'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/logo'
import { createClient } from '@/lib/supabase/client'
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
  Inbox,
  Megaphone,
  BookOpen,
  CalendarDays,
  BarChart3,
  CreditCard,
} from 'lucide-react'

type NavItem = {
  name: string
  href: string
  icon: typeof LayoutDashboard
  group: 'work' | 'manage' | 'config'
}

const navigation: NavItem[] = [
  { name: 'Visao geral', href: '/home', icon: LayoutDashboard, group: 'work' },
  { name: 'PDV', href: '/pdv', icon: Monitor, group: 'work' },
  { name: 'Pedidos', href: '/pedidos', icon: ClipboardList, group: 'work' },
  { name: 'KDS', href: '/kds', icon: ChefHat, group: 'work' },
  { name: 'Mesas', href: '/mesas', icon: Armchair, group: 'work' },
  { name: 'Reservas', href: '/reservas', icon: CalendarDays, group: 'work' },
  { name: 'Inbox', href: '/inbox', icon: Inbox, group: 'work' },

  { name: 'Cardapio', href: '/cardapio', icon: UtensilsCrossed, group: 'manage' },
  { name: 'Estacao', href: '/estacao/cartoes', icon: CreditCard, group: 'manage' },
  { name: 'Clientes', href: '/clientes', icon: Users, group: 'manage' },
  { name: 'Estoque', href: '/estoque', icon: Package, group: 'manage' },
  { name: 'Financeiro', href: '/financeiro', icon: DollarSign, group: 'manage' },
  { name: 'Avaliacoes', href: '/avaliacoes', icon: Star, group: 'manage' },

  { name: 'Marketing', href: '/marketing', icon: Megaphone, group: 'manage' },
  { name: 'Relatorios', href: '/relatorios', icon: BarChart3, group: 'manage' },

  { name: 'Assistente', href: '/assistente', icon: Sparkles, group: 'config' },
  { name: 'Automacoes', href: '/automacoes', icon: Zap, group: 'config' },
  { name: 'Configuracoes', href: '/configuracoes', icon: Settings, group: 'config' },
  { name: 'Base IA', href: '/configuracoes/conhecimento', icon: BookOpen, group: 'config' },
]

const GROUP_LABEL: Record<NavItem['group'], string> = {
  work: 'Operacao',
  manage: 'Gestao',
  config: 'Sistema',
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  restaurantId: string | null
}

function useInboxUnreadCount(restaurantId: string | null) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!restaurantId) {
      setCount(0)
      return
    }
    const supabase = createClient()

    async function load() {
      const { data } = await supabase
        .from('conversations')
        .select('unread_count')
        .eq('restaurant_id', restaurantId)
        .in('status', ['open', 'pending_agent', 'pending_customer'])
      if (data) {
        const total = data.reduce(
          (s: number, c: { unread_count: number | null }) => s + (c.unread_count ?? 0),
          0
        )
        setCount(total)
      }
    }
    load()

    const channel = supabase
      .channel(`sidebar-inbox-unread-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          load()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId])

  return count
}

export function Sidebar({ collapsed, onToggle, restaurantId }: SidebarProps) {
  const pathname = usePathname()
  const inboxUnread = useInboxUnreadCount(restaurantId)

  // Agrupa navigation preservando ordem
  const groups = navigation.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group]!.push(item)
    return acc
  }, {})

  return (
    <aside className="group island flex flex-col p-2 gap-1.5 overflow-visible relative">
      {/* Toggle flutuante de recolher */}
      <button
        onClick={onToggle}
        className="absolute z-20 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-foreground/80 hover:bg-surface-hover"
        style={{ top: '20px', right: '-12px', boxShadow: '0 2px 6px rgba(15,14,12,0.08)' }}
        aria-label={collapsed ? 'Expandir' : 'Recolher'}
      >
        {collapsed ? (
          <ChevronRight size={13} strokeWidth={2} />
        ) : (
          <ChevronLeft size={13} strokeWidth={2} />
        )}
      </button>

      {/* Brand */}
      <Link
        href="/home"
        className={cn(
          'flex items-center gap-2 px-2 pt-1 pb-2',
          collapsed && 'justify-center px-0'
        )}
      >
        <Logo size={20} />
        {!collapsed && (
          <span className="text-[14px] font-semibold tracking-tight">Txoko</span>
        )}
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-px">
        {(Object.keys(groups) as NavItem['group'][]).map((group, groupIdx) => (
          <div key={group} className={cn(groupIdx > 0 && 'mt-3')}>
            {!collapsed && (
              <div className="px-2.5 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {GROUP_LABEL[group]}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-px">
              {groups[group]!.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/home' && pathname.startsWith(item.href))
                const badge =
                  item.href === '/inbox' && inboxUnread > 0 ? inboxUnread : 0

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-md text-[13px] transition-colors',
                      collapsed ? 'justify-center px-0 py-1.5' : 'px-2.5 py-1.5',
                      isActive
                        ? 'bg-primary-soft text-foreground font-semibold'
                        : 'text-foreground/75 font-medium hover:bg-surface-hover hover:text-foreground'
                    )}
                    title={collapsed ? item.name : undefined}
                  >
                    <span className="relative flex-shrink-0">
                      <item.icon size={14.5} strokeWidth={isActive ? 2 : 1.85} />
                      {badge > 0 && collapsed && (
                        <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-destructive" />
                      )}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.name}</span>
                        {badge > 0 && (
                          <span className="bg-accent text-foreground text-[9.5px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
