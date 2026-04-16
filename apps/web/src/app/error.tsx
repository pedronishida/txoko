'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/logo'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Txoko] App error:', error)
  }, [error])

  return (
    <div className="theme-light min-h-screen bg-bg flex flex-col">
      <header className="px-8 py-6">
        <Link href="/">
          <Logo size={22} />
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-[22px] font-medium text-foreground tracking-[-0.02em]">
            Algo deu errado
          </h1>
          <p className="text-[13px] text-muted mt-3 tracking-tight leading-relaxed">
            Encontramos um erro inesperado. Ja registramos pra investigar.
          </p>
          {error.digest && (
            <p className="text-[10px] text-muted font-data mt-3 tracking-tight">
              {error.digest}
            </p>
          )}
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={reset}
              className="h-9 px-4 inline-flex items-center text-[13px] font-medium bg-foreground text-bg rounded-md hover:opacity-90 transition-opacity"
            >
              Tentar novamente
            </button>
            <Link
              href="/"
              className="text-[12px] text-muted hover:text-foreground transition-colors tracking-tight"
            >
              Voltar pra home
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
