'use client'

import { cn } from '@/lib/utils'

type Tab = {
  key: string
  label: string
  count?: number
  /** Tecla numerica que seleciona esta aba, impressa no chip. */
  hint?: string
}

type TabBarProps = {
  tabs: Tab[]
  active: string
  onChange: (key: string) => void
  /**
   * `chip` — pilula de 44px para telas de servico (KDS, PDV, Pedidos, Mesas).
   * `underline` — denso, para telas de mouse (Financeiro, Cardapio, Clientes).
   */
  variant?: 'chip' | 'underline'
  className?: string
  'aria-label'?: string
}

export function TabBar({
  tabs,
  active,
  onChange,
  variant = 'underline',
  className,
  'aria-label': ariaLabel,
}: TabBarProps) {
  if (variant === 'chip') {
    return (
      <div
        role="tablist"
        aria-label={ariaLabel}
        // Linha unica com rolagem horizontal e altura fixa: as categorias
        // embrulhavam e empurravam a grade para baixo conforme a largura da
        // janela, entao o ponto de partida do olho mudava a cada maquina.
        className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}
      >
        {tabs.map((tab) => {
          const on = active === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex h-11 shrink-0 items-center gap-[9px] whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-colors',
                on
                  ? 'border-teal bg-teal-soft text-teal-deep'
                  : 'border-rule text-ink-soft hover:bg-sunken hover:text-ink'
              )}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'rounded-[4px] px-[5px] py-0.5 font-data text-[9.5px] font-bold text-ink-soft',
                    on ? 'bg-teal-soft-hover' : 'bg-sunken'
                  )}
                >
                  {tab.count}
                </span>
              )}
              {tab.hint && (
                <kbd
                  aria-hidden
                  className={cn(
                    'rounded-[4px] px-[5px] py-0.5 font-data text-[9.5px] font-bold text-ink-soft',
                    on ? 'bg-teal-soft-hover' : 'bg-sunken'
                  )}
                >
                  {tab.hint}
                </kbd>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'no-scrollbar flex gap-5 overflow-x-auto border-b border-rule pb-3',
        className
      )}
    >
      {tabs.map((tab) => {
        const on = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative -mb-3 whitespace-nowrap pb-3 text-[12px] tracking-tight transition-colors',
              on
                ? 'font-semibold text-ink after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:rounded-full after:bg-teal'
                : 'text-ink-muted hover:text-ink'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 font-data text-[10px] text-ink-muted">
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
