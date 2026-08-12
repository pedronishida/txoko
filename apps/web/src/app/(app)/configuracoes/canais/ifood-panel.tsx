'use client'

import { useEffect, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Check, ChevronRight, Loader2, X } from 'lucide-react'
import {
  getIfoodIntegration,
  saveIfoodCredentials,
  testIfoodConnection,
  toggleIfoodIntegration,
  type IfoodIntegrationPublic,
} from './ifood-actions'

// =============================================================
// Painel de configuracao da integracao iFood
// Exibido em /configuracoes/canais como secao destacada.
// =============================================================

export function IfoodPanel({ baseUrl }: { baseUrl: string }) {
  const [integration, setIntegration] = useState<IfoodIntegrationPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Credenciais
  const [merchantId, setMerchantId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')

  // Status de teste
  const [testResult, setTestResult] = useState<{
    ok: boolean
    merchantName?: string
    merchantStatus?: string
    error?: string
  } | null>(null)

  useEffect(() => {
    getIfoodIntegration().then((res) => {
      if ('error' in res && res.error) {
        setError(res.error)
      } else if (res.integration) {
        setIntegration(res.integration)
        setMerchantId(res.integration.merchant_id ?? '')
        setClientId(res.integration.client_id ?? '')
      }
      setLoading(false)
    })
  }, [])

  const webhookUrl = integration
    ? `${baseUrl}/api/webhooks/ifood/${integration.id ? '' : ''}${
        // O restaurantId e necessario — o integration.id e da integracao, nao do restaurante.
        // Usamos a URL do webhook que inclui o restaurant_id (salvo no servidor).
        '[configure-via-acoes]'
      }`
    : null

  function handleSave() {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await saveIfoodCredentials({
        merchantId,
        clientId,
        clientSecret: clientSecret || undefined,
      })
      if ('error' in res && res.error) {
        setError(res.error)
      } else {
        setSuccess('Credenciais salvas com sucesso')
        const fresh = await getIfoodIntegration()
        if (fresh.integration) setIntegration(fresh.integration)
        if ('error' in fresh && fresh.error) setError(fresh.error)
      }
    })
  }

  function handleToggle() {
    if (!integration) return
    startTransition(async () => {
      const res = await toggleIfoodIntegration(!integration.enabled)
      if ('error' in res && res.error) {
        setError(res.error)
      } else {
        setIntegration({ ...integration, enabled: !integration.enabled })
      }
    })
  }

  function handleTest() {
    setTestResult(null)
    setError(null)
    startTransition(async () => {
      const res = await testIfoodConnection()
      setTestResult(res)
    })
  }

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <Loader2 size={16} className="text-muted animate-spin" />
      </div>
    )
  }

  const hasCredentials = Boolean(merchantId && clientId)
  const pollUrl = `${baseUrl}/api/cron/ifood-poll`

  return (
    <div className="space-y-8">
      {/* Cabecalho da secao */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-medium text-foreground tracking-tight">iFood</h3>
          {integration && (
            <button
              onClick={handleToggle}
              disabled={pending || !hasCredentials}
              className={cn(
                'h-7 px-3 text-[11px] font-medium rounded-md transition-colors disabled:opacity-40 tracking-tight',
                integration.enabled
                  ? 'bg-success/10 text-success hover:bg-success/20'
                  : 'bg-muted-subtle text-foreground/75 hover:text-foreground'
              )}
            >
              {integration.enabled ? 'Ativo' : 'Inativo'}
            </button>
          )}
        </div>
        <p className="text-[12px] text-muted tracking-tight">
          Receba pedidos do iFood diretamente no Txoko via polling ou webhook push.
        </p>
      </div>

      {/* Erros e sucesso */}
      {error && (
        <div className="px-3.5 py-2.5 bg-destructive/5 border border-destructive/20 rounded-md text-[12px] text-destructive flex items-center justify-between tracking-tight">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-3 text-destructive/60 hover:text-destructive">
            <X size={12} />
          </button>
        </div>
      )}
      {success && (
        <div className="px-3.5 py-2.5 bg-success/5 border border-success/20 rounded-md text-[12px] text-success flex items-center gap-2 tracking-tight">
          <Check size={12} />
          <span>{success}</span>
        </div>
      )}

      {/* Credenciais */}
      <section>
        <div className="mb-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
            Credenciais
          </span>
        </div>
        <div className="space-y-2.5 max-w-xl">
          <IfoodField
            label="Merchant ID"
            value={merchantId}
            onChange={setMerchantId}
            placeholder="Ex: 12345678-abcd-..."
            hint="Encontre no Portal do Parceiro iFood → Minha Loja → ID do Estabelecimento"
          />
          <IfoodField
            label="Client ID"
            value={clientId}
            onChange={setClientId}
            placeholder="ID do aplicativo OAuth"
            hint="Credenciais de desenvolvedor — solicitadas ao suporte iFood"
          />
          <IfoodField
            label="Client Secret"
            value={clientSecret}
            onChange={setClientSecret}
            placeholder="Deixe em branco para manter o atual"
            type="password"
          />
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={pending || !merchantId}
              className="h-8 px-3.5 bg-muted-subtle text-foreground text-[12px] font-medium rounded-md hover:bg-muted-subtle/70 transition-colors disabled:opacity-40 tracking-tight"
            >
              {pending ? 'Salvando' : 'Salvar credenciais'}
            </button>
            {hasCredentials && (
              <button
                onClick={handleTest}
                disabled={pending}
                className="h-8 px-3.5 text-foreground/75 text-[12px] font-medium rounded-md hover:text-foreground hover:bg-muted-subtle transition-colors disabled:opacity-40 tracking-tight"
              >
                Testar conexao
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Resultado do teste */}
      {testResult && (
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-md text-[12px] tracking-tight border',
            testResult.ok
              ? 'bg-success/5 border-success/20 text-success'
              : 'bg-primary/5 border-primary/20 text-primary'
          )}
        >
          {testResult.ok ? (
            <span>
              Conectado — <strong>{testResult.merchantName}</strong>
              {testResult.merchantStatus && (
                <span className="ml-2 opacity-70">({testResult.merchantStatus})</span>
              )}
            </span>
          ) : (
            <span>Falha: {testResult.error}</span>
          )}
        </div>
      )}

      {/* Polling */}
      {integration && (
        <section>
          <div className="mb-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
              Polling
            </span>
          </div>
          <div className="max-w-xl space-y-2.5">
            <p className="text-[12px] text-muted tracking-tight">
              Configure um scheduler externo para chamar a URL abaixo a cada 30 segundos:
            </p>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-night border border-border rounded-md">
              <code className="flex-1 text-[11px] font-mono text-foreground truncate">
                GET {pollUrl}
              </code>
            </div>
            {integration.last_polled_at && (
              <p className="text-[10px] text-muted tracking-tight">
                Ultimo polling: {new Date(integration.last_polled_at).toLocaleString('pt-BR')}
              </p>
            )}
            {integration.last_order_id && (
              <p className="text-[10px] text-muted tracking-tight">
                Ultimo pedido iFood: <span className="font-mono">{integration.last_order_id}</span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Mapeamento de produtos */}
      {integration && (
        <section>
          <div className="mb-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
              Produtos
            </span>
          </div>
          <a
            href="/configuracoes/canais/ifood-produtos"
            className="inline-flex items-center gap-1.5 h-8 px-3.5 bg-muted-subtle text-foreground text-[12px] font-medium rounded-md hover:bg-muted-subtle/70 transition-colors tracking-tight"
          >
            Gerenciar mapeamento de produtos
            <ChevronRight size={12} />
          </a>
          <p className="mt-2 text-[11px] text-muted tracking-tight">
            Associe os SKUs do iFood aos produtos do Txoko. Sem mapeamento, produtos sao
            criados automaticamente.
          </p>
        </section>
      )}
    </div>
  )
}

// -----------------------------------------------------------
// Primitivos
// -----------------------------------------------------------
function IfoodField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  type?: 'text' | 'password'
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 px-3 bg-night border border-border rounded-md text-[12px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors font-mono"
      />
      {hint && (
        <p className="mt-1 text-[10px] text-muted tracking-tight">{hint}</p>
      )}
    </div>
  )
}
