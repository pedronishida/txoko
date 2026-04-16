'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  BarChart3,
  ChefHat,
  ClipboardList,
  CornerDownLeft,
  Monitor,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
  UtensilsCrossed,
  Zap,
} from 'lucide-react'
import { globalSearch, type SearchResult } from '@/lib/server/search'

type NavItem = {
  type: 'nav'
  title: string
  subtitle: string
  href: string
  icon: typeof Monitor
}

type Item =
  | NavItem
  | (SearchResult & { icon: typeof Monitor })

const NAV_ITEMS: NavItem[] = [
  { type: 'nav', title: 'PDV', subtitle: 'Abrir ponto de venda', href: '/pdv', icon: Monitor },
  { type: 'nav', title: 'KDS', subtitle: 'Tela da cozinha', href: '/kds', icon: ChefHat },
  { type: 'nav', title: 'Pedidos', subtitle: 'Ver todos os pedidos', href: '/pedidos', icon: ClipboardList },
  { type: 'nav', title: 'Cardapio', subtitle: 'Gerenciar produtos', href: '/cardapio', icon: UtensilsCrossed },
  { type: 'nav', title: 'Mesas', subtitle: 'Status do salao', href: '/mesas', icon: ShoppingBag },
  { type: 'nav', title: 'Financeiro', subtitle: 'Visao geral + caixa', href: '/financeiro', icon: BarChart3 },
  { type: 'nav', title: 'Estoque', subtitle: 'Insumos + fornecedores', href: '/estoque', icon: Package },
  { type: 'nav', title: 'Clientes', subtitle: 'CRM + fidelidade', href: '/clientes', icon: Users },
  { type: 'nav', title: 'Avaliacoes', subtitle: 'NPS + reviews', href: '/avaliacoes', icon: Star },
  { type: 'nav', title: 'Assistente IA', subtitle: 'Chat com Claude', href: '/assistente', icon: Sparkles },
  { type: 'nav', title: 'Automacoes', subtitle: 'Triggers e logs', href: '/automacoes', icon: Zap },
]

const TYPE_ICONS: Record<SearchResult['type'], typeof Monitor> = {
  product: UtensilsCrossed,
  customer: Users,
  order: ClipboardList,
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd+K / Ctrl+K global
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Auto focus no input ao abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
    }
  }, [open])

  // Busca com debounce
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const r = await globalSearch(q)
        setResults(r)
        setSelectedIndex(0)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // Combina items para navegacao
  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filteredNav = q
      ? NAV_ITEMS.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.subtitle.toLowerCase().includes(q)
        )
      : NAV_ITEMS
    const dynamicItems: Item[] = results.map((r) => ({
      ...r,
      icon: TYPE_ICONS[r.type],
    }))
    return [...filteredNav, ...dynamicItems]
  }, [query, results])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[selectedIndex]
      if (item) {
        router.push(item.href)
        setOpen(false)
      }
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-surface border rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b">
          <Search size={18} className="text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar produtos, clientes, pedidos ou navegar..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted focus:outline-none text-sm"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-data text-muted border bg-bg">
            ESC
          </kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {items.length === 0 && (
            <p className="px-5 py-12 text-sm text-muted text-center">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </p>
          )}
          {items.map((item, i) => {
            const isSelected = i === selectedIndex
            const isNav = item.type === 'nav'
            return (
              <button
                key={`${item.type}-${item.href}-${i}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => {
                  router.push(item.href)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-5 py-3 text-left transition-colors',
                  isSelected ? 'bg-primary/10' : 'hover:bg-surface-hover'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    isSelected ? 'bg-primary/20 text-primary' : 'bg-bg text-muted'
                  )}
                >
                  <item.icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{item.title}</p>
                  <p className="text-[11px] text-muted truncate">{item.subtitle}</p>
                </div>
                {!isNav && (
                  <span className="text-[10px] text-muted uppercase tracking-wider">
                    {item.type === 'product' && 'produto'}
                    {item.type === 'customer' && 'cliente'}
                    {item.type === 'order' && 'pedido'}
                  </span>
                )}
                {isSelected && (
                  <CornerDownLeft size={14} className="text-primary shrink-0" />
                )}
              </button>
            )
          })}
        </div>

        <div className="px-5 py-2.5 border-t flex items-center justify-between text-[10px] text-muted bg-bg/50">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded font-data border bg-surface">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded font-data border bg-surface">↵</kbd>
              abrir
            </span>
          </div>
          <span className="flex items-center gap-1">
            <ArrowRight size={10} />
            powered by Supabase
          </span>
        </div>
      </div>
    </div>
  )
}
