import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Logo } from '@/components/logo'
import {
  ArrowRight,
  BarChart3,
  ChefHat,
  ClipboardList,
  Monitor,
  Package,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('https://app.txoko.com.br/dashboard')

  const features = [
    { icon: Monitor, title: 'PDV', desc: 'Venda em segundos com carrinho fluido.' },
    { icon: ChefHat, title: 'KDS', desc: 'Cozinha em tempo real, sem papelzinho.' },
    { icon: ClipboardList, title: 'Pedidos', desc: 'Salao, delivery e balcao num so lugar.' },
    { icon: Package, title: 'Estoque', desc: 'Baixa automatica via fichas tecnicas.' },
    { icon: Users, title: 'CRM + Fidelidade', desc: 'Cliente certo, oferta certa.' },
    { icon: BarChart3, title: 'Financeiro', desc: 'DRE real com dados do dia.' },
    { icon: Star, title: 'Avaliacoes IA', desc: 'Claude classifica cada review.' },
    { icon: Zap, title: 'Automacoes', desc: 'Triggers SQL reagindo a eventos.' },
  ]

  return (
    <div className="theme-light min-h-screen bg-bg text-foreground">
      <nav className="sticky top-0 z-20 backdrop-blur-md bg-bg/80 border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo size={36} showWordmark />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="https://app.txoko.com.br/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="https://app.txoko.com.br/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors shadow-sm"
            >
              Comecar <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 20%, rgba(234,29,44,0.08) 0%, transparent 40%), radial-gradient(circle at 85% 60%, rgba(255,199,0,0.08) 0%, transparent 40%)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6 py-20 sm:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-6">
              <Sparkles size={12} />
              Powered by Claude Opus 4.6
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1]">
              Gestao que faz o
              <br />
              <span className="text-primary">basico brilhar.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              O sistema que faz o basico com excelencia, aplica IA onde importa e
              automatiza o que ninguem quer fazer. PDV, KDS, Cardapio, Financeiro,
              CRM — e um assistente IA que realmente entende do seu negocio.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="https://app.txoko.com.br/login"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-all shadow-sm"
              >
                Criar conta gratis
                <ArrowRight size={16} />
              </Link>
              <Link
                href="https://app.txoko.com.br/menu/txoko-demo"
                className="inline-flex items-center gap-2 px-6 py-3.5 border-2 font-semibold rounded-xl hover:bg-surface transition-colors"
                style={{ borderColor: 'var(--border-strong)' }}
              >
                Ver cardapio demo
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span>Tempo real</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span>Multi-tenant</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span>100% dados reais</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">O pacote completo</p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
              Tudo que seu restaurante precisa,
              <br />
              em um lugar so.
            </h2>
          </div>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-surface border rounded-2xl p-5 hover:border-primary/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon size={18} className="text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-surface">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                value: '< 1s',
                label: 'Tempo de resposta',
                desc: 'Realtime via WebSocket em 8 paginas',
              },
              {
                value: '14',
                label: 'Migrations versionadas',
                desc: 'Schema evolui sem drama',
              },
              {
                value: '9',
                label: 'Triggers SQL rodando',
                desc: 'Logica no banco, nao na app',
              },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-5xl font-bold text-primary font-data tracking-tight">
                  {s.value}
                </p>
                <p className="mt-3 font-semibold text-foreground">{s.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Pronto pra modernizar sua operacao?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Crie sua conta em 30 segundos. Seu restaurante fica pronto pra rodar
            com categorias, mesas e automacoes basicas ja configuradas.
          </p>
          <Link
            href="https://app.txoko.com.br/login"
            className="mt-8 inline-flex items-center gap-2 px-8 py-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors shadow-lg text-lg"
          >
            Comecar agora
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-semibold">txoko</span>
            <span className="text-muted-foreground">&copy; 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="https://app.txoko.com.br/login" className="hover:text-foreground transition-colors">
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
