'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
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
      <nav className="border-b">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/">
            <Logo size={36} showWordmark />
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-destructive/10 text-destructive">
            <AlertTriangle size={40} />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Algo deu errado
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Encontramos um erro inesperado. Ja registramos pra investigar. Voce
              pode tentar recarregar ou voltar pra home.
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground font-data pt-2">
                ID do erro: {error.digest}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-hover transition-colors shadow-sm"
            >
              <RefreshCw size={16} />
              Tentar novamente
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-3 border-2 font-semibold rounded-xl hover:bg-surface transition-colors"
              style={{ borderColor: 'var(--border-strong)' }}
            >
              <Home size={16} />
              Voltar pra home
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
