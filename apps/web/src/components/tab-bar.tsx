'use client'

import { cn } from '@/lib/utils'

type Tab = {
  key: string
  label: string
  count?: number
}

type TabBarProps = {
  tabs: Tab[]
  active: string
  onChange: (key: string) => void
  className?: string
}

export function TabBar({ tabs, active, onChange, className }: TabBarProps) {
  return (
    <div
      className={cn(
        'flex gap-5 pb-3 border-b border-border overflow-x-auto scrollbar-none',
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            'relative text-[12px] tracking-tight whitespace-nowrap pb-3 -mb-3 transition-colors',
            active === tab.key
              ? 'text-foreground font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-success after:rounded-full'
              : 'text-muted hover:text-foreground/70'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                'ml-1.5 text-[10px] tabular-nums',
                active === tab.key ? 'text-muted' : 'text-muted/60'
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
