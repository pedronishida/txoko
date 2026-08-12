'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { testCustomerAgent, type TestCustomerAgentResult } from '../actions'

// =============================================================
// Exemplos prontos por modo
// =============================================================

const SAMPLES = {
  chat: [
    { label: 'Horario', text: 'Qual o horario de funcionamento?' },
    { label: 'Delivery', text: 'Vocês fazem delivery?' },
    { label: 'Pix', text: 'Aceitam Pix?' },
    { label: 'Reserva', text: 'Quero reservar mesa pra 4 pessoas amanha as 20h' },
    { label: 'Vegetariano', text: 'Tem opcao vegetariana?' },
    { label: 'Reclamacao', text: 'A comida estava fria, quero falar com o gerente' },
  ],
  order_taking: [
    { label: 'Pedido simples', text: 'Quero 2 pizzas calabresa, pagamento na entrega em dinheiro' },
    { label: 'Cardapio', text: 'Pode me mandar o cardapio?' },
    { label: 'Status pedido', text: 'Cade meu pedido?' },
    { label: 'Reserva', text: 'Quero reservar mesa pra 4 pessoas amanha as 20h' },
    { label: 'Restricao', text: 'Sou alergico a amendoim, oque tem sem amendoim?' },
    { label: 'Primeiro contato', text: 'Oi, boa tarde!' },
  ],
}

const ACTION_LABELS = {
  reply: 'Resposta',
  escalate: 'Escalou pra humano',
  skip: 'Pulou',
}

// =============================================================
// CustomerAgentTestView
// =============================================================

export function CustomerAgentTestView({
  entriesEnabledCount,
  agentEnabled,
  currentMode,
}: {
  entriesEnabledCount: number
  agentEnabled: boolean
  currentMode: 'chat' | 'order_taking'
}) {
  const [mode, setMode] = useState<'chat' | 'order_taking'>(currentMode)
  const [message, setMessage] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [result, setResult] = useState<TestCustomerAgentResult | null>(null)
  const [pending, startTransition] = useTransition()
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set())

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setResult(null)
    startTransition(async () => {
      setResult(
        await testCustomerAgent({
          mode,
          message: message.trim(),
          customer_phone: customerPhone.trim() || undefined,
        })
      )
    })
  }

  function toggleTool(idx: number) {
    const next = new Set(expandedTools)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setExpandedTools(next)
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/configuracoes/conhecimento"
          className="text-[11px] text-muted hover:text-foreground uppercase tracking-[0.08em]"
        >
          ← Base de Conhecimento
        </Link>
        <h1 className="text-2xl font-medium tracking-tight text-foreground mt-2">
          Test mode — agente do cliente
        </h1>
        <p className="text-muted text-sm mt-1">
          Simula uma pergunta de cliente. Mostra como o agente responderia (modo Q&A com KB ou order taking). So pra debug — em prod o cliente manda pelo WhatsApp.
        </p>
      </div>

      {/* Avisos */}
      {!agentEnabled && (
        <div className="bg-accent/5 border border-accent/30 rounded-lg p-3 text-xs text-foreground">
          ⚠️ Agente cliente desabilitado em <code>restaurants.ai_agent_enabled</code>. Test mode funciona, mas em prod nao responde clientes ate ativar.
        </div>
      )}
      {mode === 'chat' && entriesEnabledCount === 0 && (
        <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-3 text-xs text-foreground">
          Sem entradas ativas na base de conhecimento — o agente vai escalar quase sempre.{' '}
          <Link href="/configuracoes/conhecimento" className="text-success underline">
            Adiciona algumas FAQs
          </Link>{' '}
          {'ou clica "Inserir 8 FAQs prontas" pra comecar.'}
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-surface-hover border border-border rounded-lg p-4 space-y-4"
      >
        <div>
          <label className="block text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5">
            Modo do agente
          </label>
          <div className="flex gap-1 bg-muted-subtle/30 border border-border rounded-md p-1">
            <button
              type="button"
              onClick={() => {
                setMode('chat')
                setResult(null)
              }}
              className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${mode === 'chat' ? 'bg-success/20 text-success' : 'text-muted hover:text-foreground'}`}
            >
              Q&A (Haiku) — usa KB
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('order_taking')
                setResult(null)
              }}
              className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${mode === 'order_taking' ? 'bg-success/20 text-success' : 'text-muted hover:text-foreground'}`}
            >
              Order taking (Sonnet 4.5) — 7 tools
            </button>
          </div>
          <p className="text-[10px] text-muted mt-1.5">
            Modo atual em prod: <strong className="text-muted">{currentMode}</strong> — voce pode testar os dois aqui pra comparar.
          </p>
        </div>

        {mode === 'order_taking' && (
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5">
              Telefone do cliente (opcional, pra carregar perfil)
            </label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="11987654321 — se conhecido em customers, agente personaliza"
              className="w-full bg-muted-subtle border border-border rounded-md px-3 py-2 text-sm text-foreground focus:border-success focus:outline-none font-mono"
            />
            <p className="text-[10px] text-muted mt-1">
              Se telefone novo: agente trata como primeiro contato e pergunta o nome.
            </p>
          </div>
        )}

        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5">Exemplos</p>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES[mode].map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => setMessage(sample.text)}
                className="px-2.5 py-1 text-[11px] bg-muted-subtle border border-border hover:border-success/30 hover:text-success text-muted rounded-md"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5">
            Mensagem do cliente
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex: Qual o horario de funcionamento?"
            rows={3}
            maxLength={1000}
            className="w-full bg-muted-subtle border border-border rounded-md px-3 py-2 text-sm text-foreground focus:border-success focus:outline-none resize-none"
          />
          <p className="text-[10px] text-muted mt-1 text-right">{message.length} / 1000</p>
        </div>

        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            disabled={pending || !message.trim()}
            className="px-5 py-2 bg-success text-success-foreground text-sm font-medium rounded-md hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? 'Rodando...' : 'Rodar agente'}
          </button>
        </div>
      </form>

      {/* Resultado */}
      {result && (
        <div className="space-y-4">
          {result.ok ? (
            <>
              <div
                className={`border rounded-lg p-4 ${
                  result.action === 'reply'
                    ? 'bg-success/5 border-success/20'
                    : result.action === 'escalate'
                      ? 'bg-accent/5 border-accent/30'
                      : 'bg-surface-hover border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-2 text-[11px] uppercase tracking-[0.08em]">
                  <span
                    className={`font-medium ${
                      result.action === 'reply'
                        ? 'text-success'
                        : result.action === 'escalate'
                          ? 'text-accent-foreground'
                          : 'text-muted'
                    }`}
                  >
                    {ACTION_LABELS[result.action]}
                  </span>
                  <span className="text-muted font-mono normal-case tracking-normal">
                    modo {result.mode}
                    {result.confidence !== null ? ` · conf ${(100 * result.confidence).toFixed(0)}%` : ''}
                    {result.iterations !== null ? ` · ${result.iterations} iter` : ''}
                  </span>
                </div>
                {result.text && (
                  <p className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                    {result.text}
                  </p>
                )}
                {result.reason && (
                  <p className="text-muted text-sm">
                    Motivo: <span className="text-foreground">{result.reason}</span>
                  </p>
                )}
              </div>

              {result.tool_calls.length > 0 && (
                <div className="bg-surface-hover border border-border rounded-lg p-4">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted mb-3">
                    Tools executadas ({result.tool_calls.length})
                  </p>
                  <div className="space-y-2">
                    {result.tool_calls.map((tool, idx) => {
                      const isError = tool.result.startsWith('ERRO')
                      return (
                        <div key={idx} className="border border-border rounded-md overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleTool(idx)}
                            className="w-full flex items-center justify-between p-3 hover:bg-muted-subtle/40 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-destructive' : 'bg-success'}`}
                              />
                              <span className="font-mono text-foreground text-xs">{tool.name}</span>
                            </div>
                            <span className="text-muted text-xs">
                              {expandedTools.has(idx) ? '−' : '+'}
                            </span>
                          </button>
                          {expandedTools.has(idx) && (
                            <div className="border-t border-border p-3 bg-night/30 space-y-2">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.05em] text-muted mb-1">
                                  Input
                                </p>
                                <pre className="text-[11px] font-mono text-foreground bg-muted-subtle/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                  {JSON.stringify(tool.input, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.05em] text-muted mb-1">
                                  Result
                                </p>
                                <pre
                                  className={`text-[11px] font-mono p-2 rounded overflow-x-auto whitespace-pre-wrap ${isError ? 'text-destructive bg-destructive/5' : 'text-foreground bg-muted-subtle/50'}`}
                                >
                                  {tool.result}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4">
              <p className="text-[11px] uppercase tracking-[0.08em] text-destructive font-medium mb-1">
                Erro
              </p>
              <p className="text-foreground text-sm">{result.error}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border pt-4 text-[11px] text-muted space-y-1">
        <p>
          <strong className="text-muted">Modo Q&A (chat)</strong>: Haiku 4.5 le sua KB ativa, escala se a pergunta nao tiver match. Sem tools — so resposta texto.
        </p>
        <p>
          <strong className="text-muted">Modo order taking</strong>: Sonnet 4.5 com 7 tools (consultar_cardapio, montar_pedido, confirmar_pedido, salvar_cliente, consultar_meus_pedidos, criar_reserva_cliente, verificar_horario). NAO le KB.
        </p>
        <p>
          Em prod, o modo eh decidido por <code>ai_agent_config.mode</code> + rollout allowlist no canal Z-API.
        </p>
      </footer>
    </div>
  )
}
