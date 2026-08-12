'use client'

import { Section } from '../settings-ui'

const PLAN_FEATURES = [
  'PDV + comanda eletronica',
  'Pedidos ilimitados',
  'Ate 10 usuarios',
  'Modulo financeiro completo',
  'Estoque + ficha tecnica',
  'Delivery proprio',
  'Assistente IA',
  '20+ automacoes',
  'CRM + fidelidade',
  'KDS inteligente',
  'NFC-e automatica',
]

const BACKLOG_INTEGRATIONS = [
  { id: 'rappi', name: 'Rappi', description: 'Integracao de pedidos Rappi' },
  { id: 'stone', name: 'Stone', description: 'TEF integrado para pagamentos' },
  { id: 'sefaz', name: 'SEFAZ', description: 'Emissao automatica NFC-e / NF-e' },
  {
    id: 'google',
    name: 'Google Meu Negocio',
    description: 'Sincroniza avaliacoes e horarios',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Link de pagamento e split nas vendas online',
  },
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    description: 'Alternativa nacional pra link de pagamento',
  },
]

export function FaturamentoView() {
  return (
    <div className="max-w-3xl space-y-2">
      <Section
        title="Plano atual"
        description="Pro — R$ 299/mes · proxima cobranca em 03/06"
        action={
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-success bg-success/10 px-2 py-1 rounded-md">
            Pro
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          {PLAN_FEATURES.map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-2.5 text-[12px] text-foreground/75 tracking-tight"
            >
              <span className="text-success font-data">✓</span>
              {feature}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-8 border-t border-border mt-8">
          <button
            disabled
            className="h-9 px-4 text-[12px] font-medium rounded-md border border-border text-foreground/75 cursor-not-allowed disabled:opacity-50"
            title="Em breve — integracao com Stripe Billing"
          >
            Mudar de plano
          </button>
          <button
            disabled
            className="h-9 px-4 text-[12px] font-medium rounded-md border border-border text-foreground/75 cursor-not-allowed disabled:opacity-50"
            title="Em breve — historico de faturas"
          >
            Historico de faturas
          </button>
          <span className="text-[10px] text-muted tracking-tight">Em breve</span>
        </div>
      </Section>

      <Section
        title="Integracoes em desenvolvimento"
        description="Conexoes que estao no nosso backlog. Notifique seu gerente de conta se alguma e prioridade pro seu negocio."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
          {BACKLOG_INTEGRATIONS.map((integ) => (
            <div
              key={integ.id}
              className="flex items-baseline justify-between gap-3 py-2 border-b border-border/50"
            >
              <div className="min-w-0">
                <p className="text-[13px] text-foreground tracking-tight">
                  {integ.name}
                </p>
                <p className="text-[11px] text-muted tracking-tight">
                  {integ.description}
                </p>
              </div>
              <span className="text-[10px] text-muted tracking-tight shrink-0">
                Em breve
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Suporte" description="Precisa de ajuda?">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="mailto:contato@txoko.com.br"
            className="flex items-center justify-between gap-2 py-2.5 px-3.5 border border-border rounded-md hover:border-stone-dark transition-colors group"
          >
            <span className="text-[13px] text-foreground/75 group-hover:text-foreground transition-colors tracking-tight">
              Falar com suporte por email
            </span>
          </a>
          <a
            href="https://wa.me/5511999998888"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 py-2.5 px-3.5 border border-border rounded-md hover:border-stone-dark transition-colors group"
          >
            <span className="text-[13px] text-foreground/75 group-hover:text-foreground transition-colors tracking-tight">
              WhatsApp do suporte
            </span>
          </a>
        </div>
      </Section>
    </div>
  )
}
