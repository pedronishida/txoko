'use client'

import { Clock, Hash, Settings2, Users } from 'lucide-react'

const RULES = [
  {
    icon: Clock,
    title: 'Auto-fechar comanda',
    description:
      'Fecha automaticamente comandas com >2h de inatividade — evita esquecimento no encerramento do turno.',
    status: 'planejado',
  },
  {
    icon: Users,
    title: 'Capacidade default por mesa',
    description:
      'Define quantos lugares cada mesa tem. Usado por reservas e agente IA pra recomendar.',
    status: 'planejado',
  },
  {
    icon: Hash,
    title: 'Numeracao automatica',
    description:
      'Ao criar nova mesa, sugere o proximo numero livre na area selecionada.',
    status: 'planejado',
  },
  {
    icon: Settings2,
    title: 'Areas customizadas',
    description:
      'Crie areas (Salao A, Mezanino, Externa) e organize mesas visualmente por area.',
    status: 'planejado',
  },
]

export function ConfiguracaoMesasView() {
  return (
    <div className="max-w-2xl">
      <header className="mb-8">
        <h2 className="text-[16px] font-medium tracking-[-0.02em] text-foreground leading-none">
          Regras de comanda e mesa
        </h2>
        <p className="text-[12px] text-foreground/75 tracking-tight mt-1.5 max-w-lg">
          Comportamento padrao de fechamento, capacidade e organizacao de areas. Essas regras
          valem pra todas as mesas do salao.
        </p>
      </header>

      <div className="space-y-3">
        {RULES.map((rule) => {
          const Icon = rule.icon
          return (
            <div
              key={rule.title}
              className="flex items-start gap-4 p-4 border border-border rounded-lg"
            >
              <div className="w-9 h-9 rounded-md bg-muted-subtle flex items-center justify-center shrink-0">
                <Icon size={15} className="text-foreground/75" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <p className="text-[13px] font-medium text-foreground tracking-tight">
                    {rule.title}
                  </p>
                  <span className="text-[10px] uppercase tracking-[0.06em] text-muted shrink-0">
                    {rule.status}
                  </span>
                </div>
                <p className="text-[12px] text-foreground/75 tracking-tight leading-snug">
                  {rule.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-muted tracking-tight mt-6">
        Notifique seu gerente de conta se alguma destas regras eh prioridade pro seu negocio.
      </p>
    </div>
  )
}
