'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Send } from 'lucide-react'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const QUICK_SUGGESTIONS = [
  'Qual foi a receita do mes?',
  'Quais produtos mais vendem?',
  'Tem insumo com estoque critico?',
  'Quantos pedidos estao ativos?',
  'Metodo de pagamento mais usado hoje?',
]

export default function AssistentePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Pergunte sobre vendas, lucro, estoque, clientes ou pedidos. Uso dados reais do seu restaurante.',
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, typing])

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || typing) return

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    }
    const nextHistory = [...messages, userMsg]
    setMessages(nextHistory)
    setInput('')
    setTyping(true)
    setError(null)

    try {
      const payload = nextHistory
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Erro ${res.status}`)
      }
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: data.text || '(resposta vazia)',
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setTyping(false)
    }
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function renderContent(content: string) {
    return content.split('\n').map((line, i) => {
      const rendered = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-cloud">$1</strong>')
        .replace(/^- /, '<span class="text-stone-dark mr-1.5">·</span>')
      return (
        <p
          key={i}
          className={cn('text-[13px] tracking-tight leading-relaxed', !line && 'h-2')}
          dangerouslySetInnerHTML={{ __html: rendered || '&nbsp;' }}
        />
      )
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -mx-8 -mt-6">
      <header className="px-8 pt-6 pb-6 border-b border-night-lighter">
        <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
          Assistente
        </h1>
        <p className="text-[13px] text-stone mt-2 tracking-tight">
          Claude Opus 4.6 · perguntas sobre o seu restaurante
        </p>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-8 py-8"
      >
        <div className="max-w-2xl mx-auto space-y-8">
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user'
            const prevMsg = messages[i - 1]
            const showAuthor = !prevMsg || prevMsg.role !== msg.role
            return (
              <div key={msg.id} className={cn('flex', isUser && 'justify-end')}>
                <div className={cn('max-w-[85%]', !isUser && 'w-full')}>
                  {showAuthor && (
                    <p
                      className={cn(
                        'text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-2',
                        isUser && 'text-right'
                      )}
                    >
                      {isUser ? 'Voce' : 'Assistente'}
                    </p>
                  )}
                  {isUser ? (
                    <div className="inline-block rounded-lg px-3.5 py-2.5 bg-cloud text-night">
                      <p className="text-[13px] tracking-tight leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  ) : (
                    <div className="text-stone-light space-y-1">
                      {renderContent(msg.content)}
                    </div>
                  )}
                  <p
                    className={cn(
                      'text-[10px] font-data text-stone-dark mt-1.5',
                      isUser && 'text-right'
                    )}
                  >
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            )
          })}

          {typing && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-2">
                Assistente
              </p>
              <div className="flex items-center gap-1">
                <span
                  className="w-1 h-1 rounded-full bg-stone-light animate-pulse"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-1 h-1 rounded-full bg-stone-light animate-pulse"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-1 h-1 rounded-full bg-stone-light animate-pulse"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-night-lighter px-8 py-5">
        <div className="max-w-2xl mx-auto">
          {messages.length <= 2 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-5">
              {QUICK_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSend(suggestion)}
                  className="text-[11px] text-stone-dark hover:text-cloud transition-colors tracking-tight"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Pergunte ao assistente"
              disabled={typing}
              className="flex-1 h-10 bg-transparent border-0 text-[13px] text-cloud placeholder:text-stone focus:outline-none tracking-tight disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || typing}
              className="w-8 h-8 flex items-center justify-center bg-cloud text-night rounded-md hover:bg-cloud-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Enviar"
            >
              <Send size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
