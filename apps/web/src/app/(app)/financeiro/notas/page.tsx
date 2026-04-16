import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { formatCurrency } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function NotasPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).toISOString()

  const { data: ordersRaw } = await supabase
    .from('orders')
    .select('id, total, created_at, status')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', monthStart)
    .eq('status', 'closed')

  const orders = ordersRaw ?? []
  const invoiceableCount = orders.length
  const invoiceableTotal = orders.reduce((s, o) => s + Number(o.total), 0)

  const features = [
    'Emissao automatica de NFC-e ao fechar pedido',
    'Emissao de NF-e para vendas B2B e delivery',
    'Contingencia offline (SAT / emissao posterior)',
    'Cancelamento dentro da janela legal (30 min)',
    'Inutilizacao de numeros',
    'Download de XML e PDF (DANFE)',
    'Envio automatico para contabilidade (SPED)',
    'Retencao de impostos (ICMS, PIS, COFINS)',
    'Regime tributario por restaurante',
    'Integracao com certificado digital A1',
  ]

  return (
    <div className="max-w-3xl">
      {/* Status banner */}
      <div className="px-4 py-3 border border-warm/20 bg-warm/5 rounded-md mb-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-warm mb-1">
          Integracao fiscal em desenvolvimento
        </p>
        <p className="text-[12px] text-stone-light tracking-tight leading-relaxed">
          O Txoko ainda nao emite NFC-e/NF-e automaticamente. A emissao fiscal
          exige homologacao com a SEFAZ, certificado digital A1, inscricao
          estadual e regime tributario configurado — etapas que serao entregues
          com o microservico fiscal.
        </p>
      </div>

      {/* KPI band */}
      <section className="grid grid-cols-3 gap-x-10 pb-8 mb-10 border-b border-night-lighter">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Pedidos elegiveis
          </p>
          <p className="text-[28px] font-medium text-cloud tracking-[-0.03em] leading-none font-data mt-3">
            {invoiceableCount}
          </p>
          <p className="text-[11px] text-stone-dark tracking-tight mt-2">
            Fechados no mes atual
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Faturamento mensal
          </p>
          <p className="text-[28px] font-medium text-cloud tracking-[-0.03em] leading-none font-data mt-3">
            {formatCurrency(invoiceableTotal)}
          </p>
          <p className="text-[11px] text-stone-dark tracking-tight mt-2">
            Base de calculo para emissao
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Notas emitidas
          </p>
          <p className="text-[28px] font-medium text-stone-dark tracking-[-0.03em] leading-none font-data mt-3">
            0
          </p>
          <p className="text-[11px] text-stone-dark tracking-tight mt-2">
            Aguardando habilitacao SEFAZ
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mb-10 pb-10 border-b border-night-lighter">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-5">
          O que sera entregue
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-10">
          {features.map((f) => (
            <div
              key={f}
              className="flex items-baseline gap-2.5 text-[12px] text-stone-light tracking-tight"
            >
              <span className="text-stone-dark font-data">·</span>
              {f}
            </div>
          ))}
        </div>
      </section>

      {/* Prerequisites */}
      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-5">
          Prerequisitos para ligar
        </h2>
        <ol className="space-y-3 text-[12px] text-stone-light tracking-tight leading-relaxed list-decimal list-inside marker:text-stone-dark marker:font-data">
          <li>
            Cadastrar razao social, CNPJ, inscricao estadual e regime
            tributario em{' '}
            <a
              href="/configuracoes"
              className="text-stone-light hover:text-cloud transition-colors underline underline-offset-2"
            >
              Configuracoes
            </a>
            .
          </li>
          <li>
            Enviar certificado digital A1 (.pfx) via upload seguro.
          </li>
          <li>
            Homologar CNPJ na SEFAZ do estado (1–3 dias uteis).
          </li>
          <li>
            Habilitar o microservico fiscal em producao.
          </li>
          <li>
            Rodar sequencia de teste em ambiente de homologacao antes de
            producao.
          </li>
        </ol>
      </section>
    </div>
  )
}
