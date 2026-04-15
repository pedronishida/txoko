import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { formatCurrency } from '@/lib/utils'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Package,
  Receipt,
  Shield,
} from 'lucide-react'

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

  return (
    <div className="space-y-5">
      <div className="bg-warm/10 border border-warm/30 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-warm shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-bold text-warm">
              Integracao fiscal em desenvolvimento
            </h2>
            <p className="text-xs text-stone-light mt-1 leading-relaxed">
              O Txoko ainda nao emite NFC-e/NF-e automaticamente. A emissao fiscal exige
              homologacao com a SEFAZ, certificado digital A1, inscricao estadual e regime
              tributario configurado — etapas que serao entregues junto com o microservico{' '}
              <code className="text-leaf">services/fiscal</code> previsto no monorepo.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Receipt size={16} className="text-cloud" />
            <span className="text-xs text-stone">Pedidos elegiveis (mes)</span>
          </div>
          <p className="text-2xl font-bold font-data text-cloud">{invoiceableCount}</p>
          <p className="text-[10px] text-stone mt-1">
            Todos os pedidos fechados poderao emitir NFC-e
          </p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} className="text-leaf" />
            <span className="text-xs text-stone">Faturamento mensal</span>
          </div>
          <p className="text-2xl font-bold font-data text-leaf">
            {formatCurrency(invoiceableTotal)}
          </p>
          <p className="text-[10px] text-stone mt-1">
            Base de calculo para emissao em lote
          </p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-stone" />
            <span className="text-xs text-stone">Notas emitidas</span>
          </div>
          <p className="text-2xl font-bold font-data text-stone">0</p>
          <p className="text-[10px] text-stone mt-1">Aguardando habilitacao SEFAZ</p>
        </div>
      </div>

      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
          <Shield size={14} className="text-stone-light" />
          <h2 className="text-sm font-semibold text-cloud">
            O que sera entregue quando a integracao chegar
          </h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {[
            'Emissao automatica de NFC-e ao fechar pedido',
            'Emissao de NF-e para vendas B2B/delivery',
            'Contingencia offline (SAT / emissao posterior)',
            'Cancelamento dentro da janela legal (30 min)',
            'Inutilizacao de numeros',
            'Download de XML e PDF (DANFE)',
            'Envio automatico para contabilidade (SPED)',
            'Retencao de impostos (ICMS, PIS, COFINS)',
            'Regime tributario por restaurante (MEI, Simples, Lucro Real)',
            'Integracao com certificado digital A1',
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-xs text-stone-light">
              <CheckCircle2 size={14} className="text-leaf shrink-0" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-night-light border border-night-lighter rounded-xl p-5">
        <h3 className="text-sm font-semibold text-cloud mb-3">Prerequisitos pra ligar</h3>
        <ol className="space-y-2 text-xs text-stone-light list-decimal list-inside">
          <li>
            Cadastrar em{' '}
            <a href="/dashboard/configuracoes" className="text-leaf hover:underline">
              Configuracoes
            </a>
            : razao social, CNPJ, inscricao estadual e regime tributario.
          </li>
          <li>
            Enviar certificado digital A1 (formato .pfx) via upload seguro (Cloudflare R2).
          </li>
          <li>Homologar CNPJ na SEFAZ do estado (processo de 1-3 dias uteis).</li>
          <li>
            Habilitar o microservico <code className="text-leaf">services/fiscal</code> (Fly.io).
          </li>
          <li>Rodar sequencia de teste em ambiente homologacao antes de producao.</li>
        </ol>
      </div>
    </div>
  )
}
