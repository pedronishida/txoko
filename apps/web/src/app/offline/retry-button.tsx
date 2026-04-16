'use client'

import { RefreshCcw } from 'lucide-react'

export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg border border-border text-foreground text-[13px] font-medium tracking-tight hover:bg-surface-hover transition-colors"
    >
      <RefreshCcw size={13} strokeWidth={1.75} />
      Tentar novamente
    </button>
  )
}
