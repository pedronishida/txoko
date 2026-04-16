import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Logo } from '@/components/logo'

export const dynamic = 'force-dynamic'

const FEATURES = [
  { title: 'PDV', desc: 'Venda em segundos com carrinho fluido e pagamento integrado.' },
  { title: 'KDS', desc: 'Cozinha em tempo real. Sem papelzinho, sem gritaria.' },
  { title: 'Pedidos', desc: 'Salao, delivery e balcao unificados em uma interface.' },
  { title: 'Estoque', desc: 'Baixa automatica via fichas tecnicas e alerta critico.' },
  { title: 'CRM', desc: 'Perfil do cliente, pontos de fidelidade e segmentacao automatica.' },
  { title: 'Financeiro', desc: 'DRE simplificado, caixa em tempo real e contas a pagar.' },
  { title: 'Avaliacoes', desc: 'Sentimento classificado automaticamente por IA.' },
  { title: 'Automacoes', desc: 'Triggers SQL que reagem a eventos reais do seu banco.' },
]

const STATS = [
  { value: '< 1s', label: 'Tempo de resposta', desc: 'Realtime via WebSocket' },
  { value: '17', label: 'Migrations versionadas', desc: 'Schema evolui sem drama' },
  { value: '9', label: 'Triggers SQL ativos', desc: 'Logica no banco, nao na app' },
]

export default async function LandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('https://app.txoko.com.br/home')

  return (
    <div className="theme-light min-h-screen bg-bg text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-20 backdrop-blur-md bg-bg/90 border-b">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={22} />
            <span className="text-[14px] font-semibold tracking-[-0.02em]">
              Txoko
            </span>
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href="https://app.txoko.com.br/login"
              className="text-[12px] text-muted hover:text-foreground transition-colors tracking-tight"
            >
              Entrar
            </Link>
            <Link
              href="https://app.txoko.com.br/login"
              className="h-8 px-3.5 inline-flex items-center text-[12px] font-medium bg-foreground text-bg rounded-md hover:opacity-90 transition-opacity"
            >
              Comecar →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-32">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted mb-6">
          Sistema de gestao para restaurantes
        </p>
        <h1 className="text-[48px] sm:text-[64px] font-light tracking-[-0.04em] leading-[1.05] max-w-3xl">
          Gestao que faz o
          <br />
          basico brilhar.
        </h1>
        <p className="mt-8 text-[16px] text-muted max-w-lg leading-relaxed tracking-tight">
          O sistema que faz o basico com excelencia, aplica IA onde importa e
          automatiza o que ninguem quer fazer.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="https://app.txoko.com.br/login"
            className="h-11 px-6 inline-flex items-center text-[13px] font-medium bg-foreground text-bg rounded-md hover:opacity-90 transition-opacity"
          >
            Criar conta gratis →
          </Link>
          <Link
            href="https://app.txoko.com.br/menu/txoko-demo"
            className="h-11 px-6 inline-flex items-center text-[13px] font-medium text-muted border rounded-md hover:text-foreground hover:border-[var(--border-strong)] transition-colors"
          >
            Ver cardapio demo
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted mb-3">
            O pacote completo
          </p>
          <h2 className="text-[32px] font-light tracking-[-0.03em] leading-tight max-w-lg">
            Tudo que seu restaurante precisa, em um lugar so.
          </h2>
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-12 gap-x-10">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <h3 className="text-[14px] font-medium text-foreground tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-[13px] text-muted leading-relaxed tracking-tight">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t bg-[var(--surface)]">
        <div className="max-w-5xl mx-auto px-6 py-24 grid grid-cols-1 md:grid-cols-3 gap-12">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-[40px] font-light text-foreground font-data tracking-[-0.03em] leading-none">
                {s.value}
              </p>
              <p className="mt-4 text-[13px] font-medium text-foreground tracking-tight">
                {s.label}
              </p>
              <p className="mt-1 text-[12px] text-muted tracking-tight">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-[32px] font-light tracking-[-0.03em] leading-tight">
            Pronto para modernizar sua operacao?
          </h2>
          <p className="mt-4 text-[13px] text-muted max-w-md mx-auto tracking-tight leading-relaxed">
            Crie sua conta em 30 segundos. Seu restaurante fica pronto com
            categorias, mesas e automacoes ja configuradas.
          </p>
          <Link
            href="https://app.txoko.com.br/login"
            className="mt-10 h-12 px-8 inline-flex items-center text-[14px] font-medium bg-foreground text-bg rounded-md hover:opacity-90 transition-opacity"
          >
            Comecar agora →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-[11px] text-muted tracking-tight">
          <span>© 2026 Txoko</span>
          <div className="flex items-center gap-5">
            <Link
              href="https://app.txoko.com.br/login"
              className="hover:text-foreground transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="https://app.txoko.com.br/menu/txoko-demo"
              className="hover:text-foreground transition-colors"
            >
              Demo
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
