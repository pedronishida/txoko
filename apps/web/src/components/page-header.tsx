'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  subtitle?: string
  action?: ReactNode
  border?: boolean
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  action,
  border = true,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'pb-5 flex items-start justify-between gap-4',
        border && 'border-b border-border',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground leading-none">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] text-muted mt-1.5">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </header>
  )
}
