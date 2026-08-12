'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Mail, MessageSquare, Plug, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/toaster'
import {
  disconnectResend,
  disconnectTwilio,
  sendResendTest,
  sendTwilioTest,
  updateResendConfig,
  updateTwilioConfig,
  type EmailProviderConfig,
  type MarketingProviderSettings,
  type SmsProviderConfig,
} from './actions'

export function MarketingProvidersView({
  initialSettings,
}: {
  initialSettings: MarketingProviderSettings
}) {
  return (
    <div>
      <header className="mb-8">
        <h2 className="text-[16px] font-medium tracking-[-0.02em] text-foreground leading-none flex items-center gap-2.5">
          <Plug size={16} className="text-success" strokeWidth={1.5} />
          Provedores de marketing
        </h2>
        <p className="text-[12px] text-foreground/75 tracking-tight mt-1.5 max-w-2xl">
          Conecte Email (Resend) e SMS (Twilio) pra disparar campanhas e automacoes nesses canais. WhatsApp configura-se em <Link href="/configuracoes/canais" className="text-foreground underline">Canais</Link>.
        </p>
      </header>

      <div className="space-y-10 max-w-3xl">
        <EmailProviderCard initial={initialSettings.email} />
        <SmsProviderCard initial={initialSettings.sms} />
      </div>
    </div>
  )
}

function EmailProviderCard({ initial }: { initial: EmailProviderConfig | null }) {
  const [apiKey, setApiKey] = useState(initial?.api_key ?? '')
  const [fromEmail, setFromEmail] = useState(initial?.from_email ?? '')
  const [fromName, setFromName] = useState(initial?.from_name ?? '')
  const [replyTo, setReplyTo] = useState(initial?.reply_to ?? '')
  const [testTo, setTestTo] = useState('')
  const [pending, startTransition] = useTransition()

  const configured = !!(initial?.api_key && initial?.from_email)

  function handleSave() {
    startTransition(async () => {
      const res = await updateResendConfig({
        api_key: apiKey,
        from_email: fromEmail,
        from_name: fromName || undefined,
        reply_to: replyTo || undefined,
      })
      if ('error' in res && res.error) {
        toast.error('Falha ao salvar', { description: res.error })
        return
      }
      toast.success('Resend conectado')
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      const res = await disconnectResend()
      if ('error' in res && res.error) {
        toast.error('Falha', { description: res.error })
        return
      }
      setApiKey('')
      setFromEmail('')
      setFromName('')
      setReplyTo('')
      toast.success('Resend desconectado')
    })
  }

  function handleSendTest() {
    if (!testTo.trim()) {
      toast.error('Informe um email pra teste')
      return
    }
    startTransition(async () => {
      const res = await sendResendTest({ to: testTo.trim() })
      if (!res.ok) {
        toast.error('Falha no envio', { description: res.error })
        return
      }
      toast.success(`Email enviado (id: ${res.messageId.slice(0, 16)}...)`)
    })
  }

  return (
    <ProviderCard
      icon={<Mail size={16} className="text-foreground" strokeWidth={1.5} />}
      title="Email — Resend"
      subtitle="Envio transacional e marketing. Free tier: 100 emails/dia."
      configured={configured}
    >
      <div className="grid grid-cols-1 gap-4">
        <Field label="API Key">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="re_xxx..."
            className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] font-data text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="From email">
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="contato@seurest.com.br"
              className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
            />
          </Field>
          <Field label="From name (opcional)">
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Restaurante Txoko"
              className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
            />
          </Field>
        </div>
        <Field label="Reply-to (opcional)">
          <input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="atendimento@seurest.com.br"
            className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
          />
        </Field>
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={pending || !apiKey || !fromEmail}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-[12px] font-medium hover:bg-primary-hover transition-colors disabled:opacity-40"
          >
            {pending ? 'Salvando' : configured ? 'Atualizar' : 'Conectar'}
          </button>
          {configured && (
            <button
              onClick={handleDisconnect}
              disabled={pending}
              className="h-9 px-3 border border-border rounded-md text-[12px] text-foreground/75 hover:text-destructive hover:border-destructive/30 transition-colors disabled:opacity-40"
            >
              Desconectar
            </button>
          )}
        </div>
      </div>
      {configured && (
        <div className="border-t border-border pt-5 mt-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-3">
            Enviar teste
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="seu@email.com"
              className="flex-1 h-9 px-3 bg-night border border-border rounded-md text-[12px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
            />
            <button
              onClick={handleSendTest}
              disabled={pending || !testTo}
              className="h-9 px-3 border border-border rounded-md text-foreground/75 hover:text-foreground hover:border-stone transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              <Send size={12} />
              <span className="text-[12px] tracking-tight">Enviar</span>
            </button>
          </div>
        </div>
      )}
    </ProviderCard>
  )
}

function SmsProviderCard({ initial }: { initial: SmsProviderConfig | null }) {
  const [accountSid, setAccountSid] = useState(initial?.account_sid ?? '')
  const [authToken, setAuthToken] = useState(initial?.auth_token ?? '')
  const [fromNumber, setFromNumber] = useState(initial?.from_number ?? '')
  const [testTo, setTestTo] = useState('')
  const [pending, startTransition] = useTransition()

  const configured = !!(
    initial?.account_sid &&
    initial?.auth_token &&
    initial?.from_number
  )

  function handleSave() {
    startTransition(async () => {
      const res = await updateTwilioConfig({
        account_sid: accountSid,
        auth_token: authToken,
        from_number: fromNumber,
      })
      if ('error' in res && res.error) {
        toast.error('Falha ao salvar', { description: res.error })
        return
      }
      toast.success('Twilio conectado')
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      const res = await disconnectTwilio()
      if ('error' in res && res.error) {
        toast.error('Falha', { description: res.error })
        return
      }
      setAccountSid('')
      setAuthToken('')
      setFromNumber('')
      toast.success('Twilio desconectado')
    })
  }

  function handleSendTest() {
    if (!testTo.trim()) {
      toast.error('Informe um telefone pra teste (E.164 ou DDD+numero)')
      return
    }
    startTransition(async () => {
      const res = await sendTwilioTest({ to: testTo.trim() })
      if (!res.ok) {
        toast.error('Falha no envio', { description: res.error })
        return
      }
      toast.success(`SMS enviado (sid: ${res.sid.slice(0, 16)}...)`)
    })
  }

  return (
    <ProviderCard
      icon={<MessageSquare size={16} className="text-foreground" strokeWidth={1.5} />}
      title="SMS — Twilio"
      subtitle="Use Twilio com numero BR habilitado. Custo ~R$ 0,40/mensagem."
      configured={configured}
    >
      <div className="grid grid-cols-1 gap-4">
        <Field label="Account SID">
          <input
            value={accountSid}
            onChange={(e) => setAccountSid(e.target.value)}
            placeholder="ACxxxxxxxxxxxxxxxx"
            className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] font-data text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
          />
        </Field>
        <Field label="Auth Token">
          <input
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="••••••••••••••••"
            className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] font-data text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
          />
        </Field>
        <Field label="From number (E.164)">
          <input
            value={fromNumber}
            onChange={(e) => setFromNumber(e.target.value)}
            placeholder="+5511999999999"
            className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] font-data text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
          />
        </Field>
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={pending || !accountSid || !authToken || !fromNumber}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-[12px] font-medium hover:bg-primary-hover transition-colors disabled:opacity-40"
          >
            {pending ? 'Salvando' : configured ? 'Atualizar' : 'Conectar'}
          </button>
          {configured && (
            <button
              onClick={handleDisconnect}
              disabled={pending}
              className="h-9 px-3 border border-border rounded-md text-[12px] text-foreground/75 hover:text-destructive hover:border-destructive/30 transition-colors disabled:opacity-40"
            >
              Desconectar
            </button>
          )}
        </div>
      </div>
      {configured && (
        <div className="border-t border-border pt-5 mt-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-3">
            Enviar teste
          </p>
          <div className="flex gap-2">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="11999998888"
              className="flex-1 h-9 px-3 bg-night border border-border rounded-md text-[12px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
            />
            <button
              onClick={handleSendTest}
              disabled={pending || !testTo}
              className="h-9 px-3 border border-border rounded-md text-foreground/75 hover:text-foreground hover:border-stone transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              <Send size={12} />
              <span className="text-[12px] tracking-tight">Enviar</span>
            </button>
          </div>
        </div>
      )}
    </ProviderCard>
  )
}

function ProviderCard({
  icon,
  title,
  subtitle,
  configured,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  configured: boolean
  children: React.ReactNode
}) {
  return (
    <section className="border border-border rounded-lg p-6">
      <header className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-muted-subtle flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <h2 className="text-[14px] font-medium text-foreground tracking-tight">
              {title}
            </h2>
            <p className="text-[12px] text-foreground/75 tracking-tight mt-1 max-w-md">
              {subtitle}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'text-[10px] font-medium uppercase tracking-[0.08em] px-2 py-1 rounded-md',
            configured ? 'bg-success/10 text-success' : 'bg-muted-subtle text-muted'
          )}
        >
          {configured ? 'Conectado' : 'Nao conectado'}
        </span>
      </header>
      {children}
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
