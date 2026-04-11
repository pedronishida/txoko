'use client'

import { Bell, Search } from 'lucide-react'

export function Header() {
  return (
    <header className="h-14 border-b border-night-lighter bg-night-light/50 backdrop-blur-sm flex items-center justify-between px-6">
      <div className="flex items-center gap-3 flex-1">
        <div className="relative max-w-md flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="text"
            placeholder="Buscar pedidos, produtos, clientes..."
            className="w-full pl-9 pr-3 py-1.5 bg-night border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-leaf/50 focus:border-leaf/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg text-stone hover:text-cloud hover:bg-night-lighter transition-colors">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-coral rounded-full" />
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-night-lighter">
          <div className="w-8 h-8 rounded-full bg-leaf/20 flex items-center justify-center text-leaf text-sm font-bold">
            P
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-cloud">Pedro</p>
            <p className="text-xs text-stone">Proprietario</p>
          </div>
        </div>
      </div>
    </header>
  )
}
