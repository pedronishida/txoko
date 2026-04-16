'use client'

interface MenuHeaderProps {
  restaurantName: string
  tableNumber: string | null
}

export function MenuHeader({ restaurantName, tableNumber }: MenuHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur-md border-b">
      <div className="max-w-lg mx-auto px-5 py-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-[16px] font-medium text-foreground tracking-[-0.02em]">
            {restaurantName}
          </h1>
          {tableNumber && (
            <p className="text-[11px] font-data text-muted mt-0.5">
              Mesa {tableNumber}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button className="text-[11px] font-medium text-muted hover:text-foreground transition-colors tracking-tight">
            Garcom
          </button>
          <button className="text-[11px] font-medium text-foreground tracking-tight">
            Conta
          </button>
        </div>
      </div>
    </header>
  )
}
