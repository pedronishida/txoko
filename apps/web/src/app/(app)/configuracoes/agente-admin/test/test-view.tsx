'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { runAgentTest } from '../actions'
import type { AdminAgentUser, AdminAgentRole, AgentTestResult } from '../actions'

const ROLE_LABEL: Record<AdminAgentRole, string> = {
  owner: 'Owner',
  manager: 'Gerente',
  kitchen: 'Cozinha',
  cashier: 'Caixa',
  waiter: 'Garcom',
}

const EXAMPLES = [
  { label: 'Estoque baixo', text: 'O que ta acabando?' },
  { label: 'Faturamento ontem', text: 'Quanto faturei ontem?' },
  { label: 'Pedidos abertos', text: 'Tem pedido aberto agora?' },
  { label: 'Top clientes', text: 'Quem sao meus 5 melhores clientes?' },
  { label: 'Atualizar estoque', text: 'Adiciona 10 kg de arroz no estoque' },
  { label: 'Despesa manual', text: 'Paguei R$ 350 de luz hoje' },
  { label: 'Dividir conta', text: 'Divide a conta da mesa 5 em 4' },
  { label: 'Pratos prontos', text: 'Lasanha mesa 7 pronta' },
]

export function TestView({ users }: { users: AdminAgentUser[] }) {
  const activeUsers = users.filter((u) => u.active)
  const [adminId, setAdminId] = useState(activeUsers[0]?.id ?? '')
  const [message, setMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [result, setResult] = useState<AgentTestResult | null>(null)
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  function toggleExpanded(index: number) {
    const next = new Set(expanded)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setExpanded(next)
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <div>
        <Link
          href="/configuracoes/agente-admin"
          className="text-[11px] text-muted hover:text-foreground uppercase tracking-[0.08em]"
        >
          ← Agente Admin
        </Link>
        <h1 className="text-2xl font-medium tracking-tight text-foreground mt-2">Test mode</h1>
        <p className="text-muted text-sm mt-1">
          Simula uma mensagem como se viesse pelo WhatsApp. Roda o agente, executa as tools (de
          verdade), e loga em audit. So pra debug — em prod o admin manda pelo WhatsApp.
        </p>
      </div>

      {activeUsers.length === 0 ? (
        <div className="bg-accent/5 border border-accent/30 rounded-lg p-4 text-sm">
          <p className="text-foreground font-medium mb-1">Nenhum admin ativo cadastrado.</p>
          <p className="text-muted text-xs">
            Volta pra{' '}
            <Link href="/configuracoes/agente-admin" className="text-success underline">
              /configuracoes/agente-admin
            </Link>{' '}
            e adiciona pelo menos 1 admin antes de testar.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (adminId && message.trim()) {
              setResult(null)
              startTransition(async () => {
                setResult(
                  await runAgentTest({
                    admin_user_id: adminId,
                    message: message.trim(),
                    image_url: imageUrl.trim() || undefined,
                  })
                )
              })
            }
          }}
          className="bg-surface-hover border border-border rounded-lg p-4 space-y-4"
        >
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5">
              Falar como (admin)
            </label>
            <select
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              className="w-full bg-muted-subtle border border-border rounded-md px-3 py-2 text-sm text-foreground focus:border-success focus:outline-none"
            >
              {activeUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name} · {ROLE_LABEL[user.role] ?? user.role} · {user.phone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5">
              Exemplos rapidos
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => {
                    setMessage(example.text)
                  }}
                  className="px-2.5 py-1 text-[11px] bg-muted-subtle border border-border hover:border-success/30 hover:text-success text-muted rounded-md"
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5">
              Mensagem do admin
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex: O que ta acabando no estoque?"
              rows={3}
              maxLength={2000}
              className="w-full bg-muted-subtle border border-border rounded-md px-3 py-2 text-sm text-foreground focus:border-success focus:outline-none resize-none font-mono"
            />
            <p className="text-[10px] text-muted mt-1 text-right">{message.length} / 2000</p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] text-muted mb-1.5">
              URL da imagem (opcional, pra testar Vision: cupom, boleto, Pix, prato)
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://exemplo.com/cupom.jpg"
              className="w-full bg-muted-subtle border border-border rounded-md px-3 py-2 text-sm text-foreground focus:border-success focus:outline-none font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={pending || !adminId || !message.trim()}
              className="px-5 py-2 bg-success text-success-foreground text-sm font-medium rounded-md hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? 'Rodando agente...' : 'Rodar agente'}
            </button>
          </div>
        </form>
      )}

      {result && (
        <div className="space-y-4">
          {result.ok ? (
            <>
              <div className="bg-success/5 border border-success/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-success font-medium">
                    Resposta do agente
                  </p>
                  <p className="text-[11px] text-muted font-mono">
                    {result.iterations} iter · {result.tokens_in + result.tokens_out} tokens · R${' '}
                    {result.cost_brl.toFixed(4).replace('.', ',')}
                  </p>
                </div>
                <p className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                  {result.text}
                </p>
              </div>

              {result.tool_calls.length > 0 && (
                <div className="bg-surface-hover border border-border rounded-lg p-4">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted mb-3">
                    Tools executadas ({result.tool_calls.length})
                  </p>
                  <div className="space-y-2">
                    {result.tool_calls.map((call, i) => (
                      <div key={i} className="border border-border rounded-md overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(i)}
                          className="w-full flex items-center justify-between p-3 hover:bg-muted-subtle/40 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                call.ok ? 'bg-success' : 'bg-destructive'
                              }`}
                            />
                            <span className="font-mono text-foreground text-xs">{call.name}</span>
                            {!call.ok && (
                              <span className="text-[10px] uppercase tracking-[0.05em] text-destructive">
                                erro
                              </span>
                            )}
                          </div>
                          <span className="text-muted text-xs">{expanded.has(i) ? '−' : '+'}</span>
                        </button>
                        {expanded.has(i) && (
                          <div className="border-t border-border p-3 bg-night/30 space-y-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.05em] text-muted mb-1">
                                Input
                              </p>
                              <pre className="text-[11px] font-mono text-foreground bg-muted-subtle/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(call.input, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.05em] text-muted mb-1">
                                Result
                              </p>
                              <pre
                                className={`text-[11px] font-mono p-2 rounded overflow-x-auto whitespace-pre-wrap ${
                                  call.ok
                                    ? 'text-foreground bg-muted-subtle/50'
                                    : 'text-destructive bg-destructive/5'
                                }`}
                              >
                                {call.result}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted text-center">
                Esta acao foi gravada no audit log e aparece no{' '}
                <Link
                  href="/configuracoes/agente-admin/analytics"
                  className="text-success hover:underline"
                >
                  Analytics
                </Link>
                .
              </p>
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
    </div>
  )
}
