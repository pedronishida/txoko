'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { getAIResponse, QUICK_SUGGESTIONS, type ChatMessage } from '@/lib/mock-ai'
import { Send, Bot, User, Sparkles } from 'lucide-react'

export default function AssistentePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '👋 Ola! Sou o assistente IA do Txoko.\n\nPosso responder perguntas sobre vendas, lucro, estoque, clientes e muito mais. Pergunte em linguagem natural!',
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  async function handleSend(text?: string) {
    const msg = text || input.trim()
    if (!msg) return

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setTyping(true)

    // Simulate thinking delay
    await new Promise(r => setTimeout(r, 800 + Math.random() * 700))

    const response = getAIResponse(msg)
    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, assistantMsg])
    setTyping(false)
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function renderContent(content: string) {
    // Simple markdown-like rendering
    return content.split('\n').map((line, i) => {
      let rendered = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-cloud">$1</strong>')
        .replace(/• /g, '<span class="text-leaf mr-1">•</span>')
      return (
        <p key={i} className={cn('text-sm', !line && 'h-2')} dangerouslySetInnerHTML={{ __html: rendered || '&nbsp;' }} />
      )
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-leaf/10">
          <Sparkles size={20} className="text-leaf" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-cloud">Assistente IA</h1>
          <p className="text-sm text-stone">Pergunte qualquer coisa sobre seu restaurante</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : '')}
          >
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
              msg.role === 'assistant' ? 'bg-leaf/20' : 'bg-night-lighter'
            )}>
              {msg.role === 'assistant' ? <Bot size={16} className="text-leaf" /> : <User size={16} className="text-stone-light" />}
            </div>
            <div className={cn(
              'max-w-[75%] rounded-2xl px-4 py-3',
              msg.role === 'assistant'
                ? 'bg-night-light border border-night-lighter rounded-tl-sm'
                : 'bg-leaf/10 border border-leaf/20 rounded-tr-sm'
            )}>
              <div className="text-stone-light space-y-0.5">{renderContent(msg.content)}</div>
              <p className="text-[10px] text-stone mt-2 font-data">{formatTime(msg.timestamp)}</p>
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-leaf/20 flex items-center justify-center">
              <Bot size={16} className="text-leaf" />
            </div>
            <div className="bg-night-light border border-night-lighter rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-leaf/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-leaf/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-leaf/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Suggestions */}
      {messages.length <= 2 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_SUGGESTIONS.map(suggestion => (
            <button
              key={suggestion}
              onClick={() => handleSend(suggestion)}
              className="px-3 py-1.5 bg-night-light border border-night-lighter rounded-full text-xs text-stone-light hover:text-cloud hover:border-leaf/30 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Pergunte ao assistente..."
          disabled={typing}
          className="flex-1 px-4 py-3 bg-night-light border border-night-lighter rounded-xl text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-leaf/50 focus:border-leaf/50 disabled:opacity-50 transition-colors"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || typing}
          className="p-3 bg-leaf text-night rounded-xl hover:bg-leaf-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
