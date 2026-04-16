import { Logo } from '@/components/logo'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="px-8 py-6">
        <Logo size={22} />
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-[360px]">{children}</div>
      </main>
      <footer className="px-8 py-6 text-center">
        <p className="text-[11px] text-stone-dark tracking-tight">
          © 2026 Txoko · Gestao para restaurantes
        </p>
      </footer>
    </div>
  )
}
