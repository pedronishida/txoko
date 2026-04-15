'use client'

import { Bell, Receipt } from 'lucide-react'

interface MenuHeaderProps {
  restaurantName: string
  tableNumber: string | null
}

export function MenuHeader({ restaurantName, tableNumber }: MenuHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-night/95 backdrop-blur-md border-b border-night-lighter">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-cloud tracking-tight">{restaurantName}</h1>
          {tableNumber && (
            <p className="text-xs text-leaf font-data">Mesa {tableNumber}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warm/10 text-warm text-xs font-medium hover:bg-warm/20 transition-colors">
            <Bell size={14} />
            Garcom
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-leaf/20 transition-colors">
            <Receipt size={14} />
            Conta
          </button>
        </div>
      </div>
    </header>
  )
}
