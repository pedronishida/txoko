'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Logo } from '@/components/logo'

const FEATURES = [
  {
    icon: '📋',
    title: 'PDV Completo',
    desc: 'Venda rapida com multiplas formas de pagamento, divisao de conta e desconto em segundos.',
  },
  {
    icon: '💬',
    title: 'Inbox Unificada',
    desc: 'WhatsApp, e-mail e SMS em um so lugar. Responda sem trocar de aba.',
  },
  {
    icon: '🤖',
    title: 'Agente IA',
    desc: 'Responde clientes automaticamente 24/7 com Claude AI. Zero custo por mensagem.',
  },
  {
    icon: '📊',
    title: 'Relatorios Avancados',
    desc: 'DRE em tempo real, analise ABC de produtos e segmentacao RFM de clientes.',
  },
  {
    icon: '🎯',
    title: 'Marketing Automatico',
    desc: 'Campanhas com IA anti-ban via WhatsApp. Segmentacao automatica por comportamento.',
  },
  {
    icon: '📅',
    title: 'Reservas Online',
    desc: 'Agenda visual com confirmacao automatica e QR code nas mesas.',
  },
  {
    icon: '🍽️',
    title: 'Cardapio Digital',
    desc: 'Com carrinho, checkout e integracao direta com a cozinha.',
  },
  {
    icon: '🔥',
    title: 'KDS Integrado',
    desc: 'Cozinha recebe pedidos em tempo real. Sem papelzinho, sem gritaria.',
  },
  {
    icon: '💰',
    title: 'Fichas Tecnicas',
    desc: 'CMV automatico por receita. Saiba o custo exato de cada prato.',
  },
]

const STEPS = [
  {
    num: '01',
    title: 'Cadastre seu restaurante',
    desc: 'Preencha as informacoes basicas do seu negocio. Leva menos de 2 minutos.',
    time: '2 min',
  },
  {
    num: '02',
    title: 'Importe seu cardapio',
    desc: 'Adicione produtos manualmente, importe via Excel ou use nosso cardapio de exemplo.',
    time: '10 min',
  },
  {
    num: '03',
    title: 'Comece a vender',
    desc: 'Em 1 dia voce esta no ar com PDV, cardapio digital e gestao completa.',
    time: '1 dia',
  },
]

const COMPARISON = [
  { feature: 'Taxa por pedido', txoko: 'Zero', others: '2–3%' },
  { feature: 'IA nativa', txoko: 'Sim', others: 'Nao' },
  { feature: 'Cardapio + Reservas + PDV', txoko: 'Integrado', others: '3 sistemas' },
  { feature: 'Suporte WhatsApp', txoko: 'Sim', others: 'Raro' },
  { feature: 'Marketing automatico', txoko: 'Incluso', others: 'Pago a parte' },
  { feature: 'KDS para cozinha', txoko: 'Incluso', others: 'Modulo extra' },
]

const PLANS = [
  {
    name: 'Starter',
    price: 79,
    highlight: false,
    desc: 'Para restaurantes que estao comecando.',
    features: [
      'Ate 100 pedidos/mes',
      '1 usuario',
      'PDV completo',
      'Cardapio digital',
      'Relatorios basicos',
      'Suporte por e-mail',
    ],
  },
  {
    name: 'Pro',
    price: 199,
    highlight: true,
    desc: 'Para restaurantes em crescimento.',
    features: [
      'Ate 1.000 pedidos/mes',
      '5 usuarios',
      'Tudo do Starter',
      'IA nativa (Claude)',
      'Marketing automatico',
      'Inbox unificada',
      'Reservas online',
      'Suporte WhatsApp',
    ],
  },
  {
    name: 'Enterprise',
    price: 499,
    highlight: false,
    desc: 'Para redes e grandes operacoes.',
    features: [
      'Pedidos ilimitados',
      'Usuarios ilimitados',
      'Tudo do Pro',
      'Multi-unidade',
      'API dedicada',
      'Suporte prioritario 24/7',
      'Onboarding dedicado',
    ],
  },
]

const FAQ = [
  {
    q: 'Precisa de cartao de credito para comecar?',
    a: 'Nao. O periodo de 14 dias gratis nao exige cartao. Voce so precisa de um e-mail.',
  },
  {
    q: 'Quanto tempo leva para estar operacional?',
    a: 'Menos de 1 dia. Muitos clientes comecem a vender no mesmo dia do cadastro.',
  },
  {
    q: 'Funciona com iFood?',
    a: 'Sim, integracao nativa com iFood, Rappi e WhatsApp Business.',
  },
  {
    q: 'Posso migrar do meu sistema atual?',
    a: 'Sim. Importamos produtos, clientes e historico de outros sistemas via Excel/CSV.',
  },
  {
    q: 'Tem app para o garcom?',
    a: 'Cardapio digital e PDV mobile funcionam em qualquer celular, sem instalar nada.',
  },
  {
    q: 'E possivel cancelar a qualquer momento?',
    a: 'Sim, sem multa e sem burocracia. Voce cancela quando quiser pelo proprio painel.',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[var(--border)] last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full py-5 flex items-center justify-between gap-4 text-left"
      >
        <span className="text-[15px] font-medium text-foreground tracking-tight">{q}</span>
        <span className="text-muted-foreground shrink-0 text-lg leading-none">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <p className="pb-5 text-[14px] text-muted-foreground leading-relaxed tracking-tight">
          {a}
        </p>
      )}
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="theme-light min-h-screen bg-bg text-foreground">

      {/* Nav */}
      <nav className="sticky top-0 z-20 backdrop-blur-md bg-bg/90 border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">
              Txoko
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#funcionalidades" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors tracking-tight">
              Funcionalidades
            </a>
            <a href="#como-funciona" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors tracking-tight">
              Como funciona
            </a>
            <a href="#planos" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors tracking-tight">
              Planos
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login" prefetch={false}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors tracking-tight hidden sm:block"
            >
              Entrar
            </Link>
            <Link
              href="/signup" prefetch={false}
              className="h-9 px-4 inline-flex items-center text-[13px] font-medium bg-foreground text-bg rounded-lg hover:opacity-90 transition-opacity"
            >
              Comecar gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 sm:pt-28 pb-24 sm:pb-32">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-success/10 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-success">
              14 dias gratis, sem cartao de credito
            </span>
          </div>
          <h1 className="text-[44px] sm:text-[64px] lg:text-[72px] font-light tracking-[-0.04em] leading-[1.05] text-foreground">
            Gestao completa para
            <br />
            <span className="text-primary">o seu restaurante.</span>
            <br />
            Sem complicacao.
          </h1>
          <p className="mt-8 text-[17px] sm:text-[18px] text-muted-foreground max-w-xl leading-relaxed tracking-tight">
            Txoko reune PDV, cardapio digital, marketing, reservas e IA em um so lugar.
            Sem taxas por pedido.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/signup" prefetch={false}
              className="h-12 px-7 inline-flex items-center gap-2 text-[15px] font-medium bg-foreground text-bg rounded-lg hover:opacity-90 transition-opacity"
            >
              Comecar gratis
              <span aria-hidden>→</span>
            </Link>
            <a
              href="#como-funciona"
              className="h-12 px-7 inline-flex items-center text-[15px] font-medium text-muted-foreground border border-[var(--border)] rounded-lg hover:text-foreground hover:border-[var(--border-strong)] transition-colors"
            >
              Ver como funciona
            </a>
          </div>
        </div>

        {/* Mock dashboard */}
        <div className="mt-16 sm:mt-20 relative">
          <div className="bg-[#0F0F0F] rounded-2xl overflow-hidden border border-[#262626] shadow-2xl">
            {/* Window chrome */}
            <div className="px-4 py-3 border-b border-[#262626] flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
              <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
              <div className="w-3 h-3 rounded-full bg-[#28C940]" />
              <div className="ml-4 flex-1 h-6 bg-[#262626] rounded-md max-w-xs" />
            </div>
            {/* Dashboard mockup */}
            <div className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: 'Receita hoje', value: 'R$ 4.820' },
                { label: 'Pedidos', value: '47' },
                { label: 'Ticket medio', value: 'R$ 102,55' },
                { label: 'Mesas ocupadas', value: '8/12' },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-[#141414] rounded-xl p-4 border border-[#262626]">
                  <p className="text-[10px] text-[#737373] uppercase tracking-widest font-medium">{kpi.label}</p>
                  <p className="text-[22px] sm:text-[24px] font-medium text-[#FAFAFA] mt-2 tracking-tight font-data">{kpi.value}</p>
                </div>
              ))}
              <div className="col-span-2 sm:col-span-3 bg-[#141414] rounded-xl p-4 border border-[#262626]">
                <p className="text-[10px] text-[#737373] uppercase tracking-widest font-medium mb-3">Pedidos recentes</p>
                <div className="space-y-2.5">
                  {[
                    { id: 'A3F9', label: 'Mesa 4', status: 'Preparando', statusColor: '#FFC700', val: 'R$ 89,00' },
                    { id: 'B1D2', label: 'Delivery', status: 'Pronto', statusColor: '#22C55E', val: 'R$ 134,50' },
                    { id: 'C7E1', label: 'Mesa 2', status: 'Entregue', statusColor: '#737373', val: 'R$ 210,00' },
                  ].map((o) => (
                    <div key={o.id} className="flex items-center justify-between py-1.5">
                      <span className="text-[10px] text-[#737373] font-mono w-10">#{o.id}</span>
                      <span className="text-[11px] text-[#D4D4D4] flex-1 px-2">{o.label}</span>
                      <span className="text-[10px] w-16" style={{ color: o.statusColor }}>{o.status}</span>
                      <span className="text-[11px] text-[#FAFAFA] font-mono">{o.val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-[#141414] rounded-xl p-4 border border-[#262626]">
                <p className="text-[10px] text-[#737373] uppercase tracking-widest font-medium mb-3">IA assistente</p>
                <div className="space-y-2">
                  <div className="bg-[#1A1A1A] rounded-lg p-2.5">
                    <p className="text-[10px] text-[#D4D4D4] leading-relaxed">Seu CMV subiu 2% esta semana. Recomendo revisar o custo do frango.</p>
                  </div>
                  <div className="bg-[#FF3346]/10 rounded-lg p-2.5 border border-[#FF3346]/15">
                    <p className="text-[10px] text-[#FF3346] leading-relaxed">Campanha enviada para 240 clientes inativos.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Glow */}
          <div className="absolute -inset-x-20 -bottom-10 h-24 bg-primary/8 blur-3xl rounded-full pointer-events-none" />
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-[var(--border)] bg-bg-elevated">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 text-center">
            {[
              'Feito para restaurantes brasileiros',
              '15+ modulos integrados',
              'IA nativa Claude',
              'Sem taxa por pedido',
            ].map((label, i, arr) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="text-success text-lg leading-none">✓</span>
                <span className="text-[13px] text-muted-foreground tracking-tight">{label}</span>
                {i < arr.length - 1 && (
                  <span className="hidden sm:block w-px h-4 bg-[var(--border)] ml-12" aria-hidden />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="funcionalidades" className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary mb-4">
            O pacote completo
          </p>
          <h2 className="text-[32px] sm:text-[40px] font-light tracking-[-0.03em] leading-tight text-foreground">
            Tudo que seu restaurante precisa,
            em um lugar so.
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-bg rounded-2xl p-6 border border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-sm transition-all"
            >
              <span className="text-2xl block mb-4">{f.icon}</span>
              <h3 className="text-[15px] font-medium text-foreground tracking-tight mb-2">
                {f.title}
              </h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed tracking-tight">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works (dark section) */}
      <section id="como-funciona" className="bg-[#0F0F0F]">
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#FF3346] mb-4">
              Simples assim
            </p>
            <h2 className="text-[32px] sm:text-[40px] font-light tracking-[-0.03em] leading-tight text-[#FAFAFA]">
              Do cadastro ao primeiro pedido
              em menos de 1 dia.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step, idx) => (
              <div key={step.num} className="relative">
                {idx < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-full w-full h-px border-t border-dashed border-[#262626] z-0 -translate-x-1/2" />
                )}
                <div className="relative z-10">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#FF3346]/10 border border-[#FF3346]/25 mb-5">
                    <span className="text-[18px] font-light text-[#FF3346] tracking-tight font-data">
                      {step.num}
                    </span>
                  </div>
                  <h3 className="text-[18px] font-medium text-[#FAFAFA] tracking-tight mb-2">
                    {step.title}
                  </h3>
                  <p className="text-[14px] text-[#A3A3A3] leading-relaxed tracking-tight mb-3">
                    {step.desc}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#FF3346] tracking-tight">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF3346]" />
                    {step.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 sm:mt-14 text-center">
            <Link
              href="/signup" prefetch={false}
              className="h-12 px-8 inline-flex items-center gap-2 text-[15px] font-medium bg-[#FAFAFA] text-[#0F0F0F] rounded-lg hover:bg-white transition-colors"
            >
              Comecar agora
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary mb-4">
            Por que Txoko
          </p>
          <h2 className="text-[32px] sm:text-[40px] font-light tracking-[-0.03em] leading-tight text-foreground">
            A diferenca esta nos detalhes
            que importam.
          </h2>
        </div>
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl overflow-hidden border border-[var(--border)]">
            <div className="grid grid-cols-3 bg-surface">
              <div className="px-4 sm:px-6 py-4 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Recurso
              </div>
              <div className="px-4 sm:px-6 py-4 text-center">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <Logo size={16} />
                  Txoko
                </span>
              </div>
              <div className="px-4 sm:px-6 py-4 text-center text-[12px] font-medium text-muted-foreground">
                Concorrentes
              </div>
            </div>
            {COMPARISON.map((row, idx) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 border-t border-[var(--border)] ${idx % 2 === 0 ? 'bg-bg' : 'bg-bg-elevated'}`}
              >
                <div className="px-4 sm:px-6 py-4 text-[13px] text-foreground tracking-tight">
                  {row.feature}
                </div>
                <div className="px-4 sm:px-6 py-4 text-center">
                  <span className="text-[13px] font-medium text-success">{row.txoko}</span>
                </div>
                <div className="px-4 sm:px-6 py-4 text-center">
                  <span className="text-[13px] text-muted-foreground">{row.others}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="bg-surface">
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary mb-4">
              Planos
            </p>
            <h2 className="text-[32px] sm:text-[40px] font-light tracking-[-0.03em] leading-tight text-foreground">
              Comece gratis.
              Escale quando precisar.
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground tracking-tight">
              14 dias gratis em qualquer plano. Sem cartao de credito.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-7 flex flex-col ${
                  plan.highlight
                    ? 'bg-[#0F0F0F] border-2 border-primary relative shadow-xl shadow-primary/5'
                    : 'bg-bg border border-[var(--border)]'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground text-[11px] font-semibold uppercase tracking-wider rounded-full">
                      Mais popular
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className={`text-[18px] font-semibold tracking-tight mb-1 ${plan.highlight ? 'text-[#FAFAFA]' : 'text-foreground'}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-[13px] tracking-tight ${plan.highlight ? 'text-[#A3A3A3]' : 'text-muted-foreground'}`}>
                    {plan.desc}
                  </p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className={`text-[42px] font-light tracking-[-0.04em] font-data ${plan.highlight ? 'text-[#FAFAFA]' : 'text-foreground'}`}>
                      R$ {plan.price}
                    </span>
                    <span className={`text-[13px] ${plan.highlight ? 'text-[#A3A3A3]' : 'text-muted-foreground'}`}>/mes</span>
                  </div>
                </div>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className={`text-sm mt-0.5 shrink-0 ${plan.highlight ? 'text-primary' : 'text-success'}`}>✓</span>
                      <span className={`text-[13px] tracking-tight ${plan.highlight ? 'text-[#D4D4D4]' : 'text-muted-foreground'}`}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup" prefetch={false}
                  className={`w-full h-11 inline-flex items-center justify-center text-[14px] font-medium rounded-xl transition-colors ${
                    plan.highlight
                      ? 'bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]'
                      : 'bg-foreground text-bg hover:opacity-90'
                  }`}
                >
                  Comecar gratis
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-20 sm:py-28">
        <div className="text-center mb-12 sm:mb-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary mb-4">
            Duvidas frequentes
          </p>
          <h2 className="text-[32px] sm:text-[40px] font-light tracking-[-0.03em] leading-tight text-foreground">
            Respondemos as mais comuns.
          </h2>
        </div>
        <div>
          {FAQ.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#0F0F0F]">
        <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28 text-center">
          <h2 className="text-[40px] sm:text-[48px] font-light tracking-[-0.04em] leading-tight text-[#FAFAFA]">
            Comece seu teste
            <br />
            <span className="text-[#FF3346]">gratis agora.</span>
          </h2>
          <p className="mt-6 text-[16px] text-[#A3A3A3] max-w-md mx-auto tracking-tight leading-relaxed">
            14 dias sem cartao de credito. Configure em minutos.
            Cancele quando quiser.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup" prefetch={false}
              className="h-12 px-8 inline-flex items-center gap-2 text-[15px] font-medium bg-[#FF3346] text-white rounded-lg hover:bg-[#FF5260] transition-colors"
            >
              Criar conta gratis
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/login" prefetch={false}
              className="h-12 px-8 inline-flex items-center text-[15px] font-medium text-[#A3A3A3] border border-[#262626] rounded-lg hover:text-[#FAFAFA] hover:border-[#363636] transition-colors"
            >
              Ja tenho conta
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-bg-elevated">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <Logo size={22} />
              <span className="text-[14px] font-medium tracking-tight text-foreground">Txoko</span>
            </div>
            <div className="flex items-center gap-6 text-[12px] text-muted-foreground">
              <Link href="/termos" className="hover:text-foreground transition-colors tracking-tight">
                Termos
              </Link>
              <Link href="/privacidade" className="hover:text-foreground transition-colors tracking-tight">
                Privacidade
              </Link>
              <a href="mailto:contato@txoko.com.br" className="hover:text-foreground transition-colors tracking-tight">
                Contato
              </a>
            </div>
            <span className="text-[12px] text-muted-foreground tracking-tight">
              © 2026 Txoko · Gestao para restaurantes
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
