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
  Monitor,
  ChefHat,
  Sparkles,
  Zap,
  Star,
  Inbox,
} from 'lucide-react'

type NavItem = {
  name: string
  href: string
  icon: typeof LayoutDashboard
  group: 'work' | 'manage' | 'config'
}

const navigation: NavItem[] = [
  { name: 'Visao geral', href: '/dashboard', icon: LayoutDashboard, group: 'work' },
  { name: 'PDV', href: '/dashboard/pdv', icon: Monitor, group: 'work' },
  { name: 'Pedidos', href: '/dashboard/pedidos', icon: ClipboardList, group: 'work' },
  { name: 'KDS', href: '/dashboard/kds', icon: ChefHat, group: 'work' },
  { name: 'Mesas', href: '/dashboard/mesas', icon: Armchair, group: 'work' },
  { name: 'Inbox', href: '/dashboard/inbox', icon: Inbox, group: 'work' },

  { name: 'Cardapio', href: '/dashboard/cardapio', icon: UtensilsCrossed, group: 'manage' },
  { name: 'Clientes', href: '/dashboard/clientes', icon: Users, group: 'manage' },
  { name: 'Estoque', href: '/dashboard/estoque', icon: Package, group: 'manage' },
  { name: 'Financeiro', href: '/dashboard/financeiro', icon: DollarSign, group: 'manage' },
  { name: 'Avaliacoes', href: '/dashboard/avaliacoes', icon: Star, group: 'manage' },

  { name: 'Assistente', href: '/dashboard/assistente', icon: Sparkles, group: 'config' },
  { name: 'Automacoes', href: '/dashboard/automacoes', icon: Zap, group: 'config' },
  { name: 'Configuracoes', href: '/dashboard/configuracoes', icon: Settings, group: 'config' },
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
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-bg border-r border-night-lighter flex flex-col transition-[width] duration-200 ease-out',
        collapsed ? 'w-[60px]' : 'w-[220px]'
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center h-16 px-5',
          collapsed && 'justify-center px-0'
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Logo size={22} />
          {!collapsed && (
            <span className="text-[14px] font-semibold tracking-[-0.02em] text-cloud">
              Txoko
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-2 px-2">
        {(Object.keys(groups) as NavItem['group'][]).map((group, groupIdx) => (
          <div key={group} className={cn(groupIdx > 0 && 'mt-6')}>
            {!collapsed && (
              <div className="px-3 pb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                  {GROUP_LABEL[group]}
                </span>
              </div>
            )}
            <div className="space-y-px">
              {groups[group]!.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href))
                const isInbox = item.href === '/dashboard/inbox'
                const badge = isInbox && inboxUnread > 0 ? inboxUnread : 0

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group relative flex items-center gap-3 h-8 rounded-md transition-colors',
                      collapsed ? 'justify-center px-0' : 'px-3',
                      isActive
                        ? 'bg-night-light text-cloud'
                        : 'text-stone-light hover:text-cloud hover:bg-night-light/50'
                    )}
                    title={collapsed ? item.name : undefined}
                  >
                    <div className="relative shrink-0">
                      <item.icon
                        size={15}
                        strokeWidth={isActive ? 2 : 1.75}
                        className={cn(
                          isActive ? 'text-cloud' : 'text-stone'
                        )}
                      />
                      {badge > 0 && collapsed && (
                        <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    {!collapsed && (
                      <>
                        <span className="text-[13px] tracking-tight flex-1">
                          {item.name}
                        </span>
                        {badge > 0 && (
                          <span className="text-[10px] font-data font-medium text-primary">
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

      {/* Collapse toggle */}
      <div className="p-2 border-t border-night-lighter">
        <button
          onClick={onToggle}
          className={cn(
            'flex items-center h-8 w-full rounded-md text-stone hover:text-cloud hover:bg-night-light/50 transition-colors',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          )}
          aria-label={collapsed ? 'Expandir' : 'Recolher'}
        >
          <ChevronLeft
            size={14}
            strokeWidth={1.75}
            className={cn(
              'transition-transform duration-200',
              collapsed && 'rotate-180'
            )}
          />
          {!collapsed && (
            <span className="text-[12px] tracking-tight">Recolher</span>
          )}
        </button>
      </div>
    </aside>
  )
}
