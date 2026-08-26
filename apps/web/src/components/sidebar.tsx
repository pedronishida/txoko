'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
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

const GROUP_ORDER: NavItem['group'][] = ['work', 'manage', 'config']

const GROUP_LABEL: Record<NavItem['group'], string> = {
  work: 'Operacao',
  manage: 'Gestao',
  config: 'Sistema',
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

/**
 * Navegacao lateral.
 *
 * Abaixo de 1240px vira trilho de icones por CSS (ver globals.css). Nao ha
 * mais estado de recolhimento nem botao de alternar: o rotulo de cada link
 * continua no DOM, recortado para fora da tela, entao o trilho mantem os 19
 * nomes acessiveis e o alvo de 44x44 em vez de encolher junto.
 */
export function Sidebar({ restaurantId }: { restaurantId: string | null }) {
  const pathname = usePathname()
  const inboxUnread = useInboxUnreadCount(restaurantId)

  return (
    <aside data-nav-rail className="island thin-scroll flex flex-col gap-0.5 overflow-x-hidden overflow-y-auto rounded-[20px] px-2.5 py-4">
      <nav className="flex flex-col gap-0.5" aria-label="Navegacao principal">
        {GROUP_ORDER.map((group, groupIdx) => (
          <div key={group} className="flex flex-col gap-0.5">
            <p
              data-nav-group
              className={cn(
                'mx-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-[0.09em] text-ink-muted',
                groupIdx === 0 ? 'mt-1' : 'mt-3.5'
              )}
            >
              {GROUP_LABEL[group]}
            </p>

            {navigation
              .filter((item) => item.group === group)
              .map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/home' && pathname.startsWith(item.href))
                const badge =
                  item.href === '/inbox' && inboxUnread > 0 ? inboxUnread : 0

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-nav-link
                    title={item.name}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      // 44px tambem no desktop: o Handoff lista a navegacao
                      // lateral entre as superficies de alvo minimo, junto com
                      // PDV, KDS, Mesas, Pedidos e Reservas. O denso de 32-38px
                      // fica para Financeiro, Cardapio e Clientes.
                      'flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-[13px] transition-colors',
                      isActive
                        ? 'bg-teal-tint-2 font-semibold text-teal-deep'
                        : 'font-medium text-ink-soft hover:bg-sunken hover:text-ink'
                    )}
                  >
                    <item.icon
                      size={15}
                      strokeWidth={2}
                      className="shrink-0"
                      aria-hidden
                    />
                    <span data-nav-label className="flex-1 truncate">
                      {item.name}
                    </span>
                    {badge > 0 && (
                      <span
                        data-nav-badge
                        className="rounded-[5px] bg-amber px-1.5 py-0.5 font-data text-[9.5px] font-bold text-on-amber"
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                )
              })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
