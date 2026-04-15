import Link from 'next/link'
import { ArrowLeft, Home } from 'lucide-react'
import { Logo } from '@/components/logo'

export default function NotFound() {
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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 text-primary">
            <span className="text-5xl font-bold font-data tracking-tight">
              404
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Pagina nao encontrada
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Essa pagina nao existe ou foi movida. Talvez voce tenha digitado o
              endereco errado, ou clicou num link antigo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-hover transition-colors shadow-sm"
            >
              <Home size={16} />
              Voltar pra home
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-3 border-2 font-semibold rounded-xl hover:bg-surface transition-colors"
              style={{ borderColor: 'var(--border-strong)' }}
            >
              <ArrowLeft size={16} />
              Ir pro dashboard
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-xs text-muted-foreground">
          &copy; 2026 Txoko
        </div>
      </footer>
    </div>
  )
}
