'use client'

import { useEffect, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { Channel, ChannelStatus, ChannelType } from '@txoko/shared'
import { Check, Copy, Loader2, X } from 'lucide-react'
import {
  createChannel,
  deleteChannel,
  disconnectZapi,
  getZapiQrCode,
  getZapiStatus,
  registerZapiWebhooks,
  restartZapi,
  rotateWebhookSecret,
  saveZapiCredentials,
  syncZapiConnectedPhone,
  updateChannel,
} from './actions'
import { IfoodPanel } from './ifood-panel'

// =============================================================
// Canais — configuracao de integracoes de atendimento.
// Tipografia-led, sem icones decorativos. Single accent (primary).
// =============================================================

type ChannelMeta = {
  label: string
  description: string
  hasWebhook: boolean
}

const CHANNEL_META: Record<ChannelType, ChannelMeta> = {
  whatsapp_zapi: {
    label: 'WhatsApp',
    description: 'Via Z-API. Recebe mensagens, mida e status em tempo real.',
    hasWebhook: true,
  },
  instagram: {
    label: 'Instagram',
    description: 'DMs via Meta Graph API. Requer app Meta em producao.',
    hasWebhook: true,
  },
  facebook_messenger: {
    label: 'Messenger',
    description: 'Mensagens de paginas via Meta Graph API.',
    hasWebhook: true,
  },
  ifood_chat: {
    label: 'iFood',
    description: 'Chat do iFood Merchant via polling.',
    hasWebhook: false,
  },
  google_reviews: {
    label: 'Google',
    description: 'Respostas a avaliacoes Google Business.',
    hasWebhook: false,
  },
  internal_qr: {
    label: 'QR interno',
    description: 'Feedback via QR code nas mesas. Configurado automaticamente.',
    hasWebhook: false,
  },
}

const STATUS_META: Record<ChannelStatus, { label: string; tone: 'active' | 'neutral' | 'error' | 'warning' }> = {
  active: { label: 'Conectado', tone: 'active' },
  disconnected: { label: 'Desconectado', tone: 'neutral' },
  error: { label: 'Com erro', tone: 'error' },
  pending_setup: { label: 'Aguardando setup', tone: 'warning' },
}

export function CanaisView({
  channels,
  baseUrl,
}: {
  channels: Channel[]
  baseUrl: string
}) {
  const [showNew, setShowNew] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleRotate(channelId: string) {
    if (!confirm('Girar o secret invalidara a URL atual. Continuar?')) return
    startTransition(async () => {
      const res = await rotateWebhookSecret(channelId)
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function handleDelete(channelId: string) {
    if (!confirm('Remover este canal? Conversas existentes serao mantidas.')) return
    startTransition(async () => {
      const res = await deleteChannel(channelId)
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function handleToggleStatus(channel: Channel) {
    const next: ChannelStatus =
      channel.status === 'active' ? 'disconnected' : 'active'
    startTransition(async () => {
      const res = await updateChannel({ id: channel.id, status: next })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  return (
    <div className="max-w-4xl">
      {/* Page header */}
      <header className="mb-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
              Canais
            </h1>
            <p className="text-[13px] text-stone mt-2 tracking-tight max-w-lg">
              Conecte WhatsApp, Instagram, Messenger, iFood e Google ao Inbox.
              Cada canal tem sua propria URL de webhook.
            </p>
          </div>
          <button
            onClick={() => {
              setError(null)
              setShowNew(true)
            }}
            className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
          >
            Novo canal
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary flex items-center justify-between tracking-tight">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-3 text-primary/60 hover:text-primary"
            aria-label="Fechar"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {channels.length === 0 ? (
        <div className="border border-night-lighter rounded-lg py-16 text-center">
          <p className="text-[13px] text-stone tracking-tight">
            Nenhum canal configurado ainda
          </p>
          <p className="text-[11px] text-stone-dark mt-1.5 tracking-tight">
            Crie um canal para comecar a receber mensagens no Inbox
          </p>
        </div>
      ) : (
        <div className="border border-night-lighter rounded-lg overflow-hidden divide-y divide-night-lighter">
          {channels.map((channel) => {
            const meta = CHANNEL_META[channel.type]
            const statusMeta = STATUS_META[channel.status]
            const isExpanded = expandedId === channel.id

            return (
              <div key={channel.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : channel.id)}
                  className="w-full text-left px-6 py-5 hover:bg-night-light/40 transition-colors flex items-start justify-between gap-6"
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <StatusDot tone={statusMeta.tone} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[14px] font-medium text-cloud tracking-tight">
                          {channel.name}
                        </span>
                        <span className="text-[11px] text-stone-dark tracking-tight">
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-[12px] text-stone tracking-tight">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-[11px] tracking-tight shrink-0 self-start mt-0.5',
                      statusMeta.tone === 'active' && 'text-leaf',
                      statusMeta.tone === 'error' && 'text-primary',
                      statusMeta.tone === 'warning' && 'text-warm',
                      statusMeta.tone === 'neutral' && 'text-stone'
                    )}
                  >
                    {statusMeta.label}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-night-lighter px-6 py-5 bg-night-light/20">
                    {channel.type === 'whatsapp_zapi' ? (
                      <ZapiChannelPanel
                        channel={channel}
                        baseUrl={baseUrl}
                        onError={setError}
                      />
                    ) : (
                      <GenericChannelPanel
                        channel={channel}
                        baseUrl={baseUrl}
                        onToggleStatus={handleToggleStatus}
                        onDelete={handleDelete}
                        onRotate={handleRotate}
                        pending={pending}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ============================================================= */}
      {/* Integracao iFood — pedidos chegam via polling ou webhook push  */}
      {/* ============================================================= */}
      <section className="mt-12 border border-night-lighter rounded-lg p-6">
        <IfoodPanel baseUrl={baseUrl} />
      </section>

      {showNew && (
        <NewChannelModal
          onClose={() => setShowNew(false)}
          onError={setError}
          onCreated={(id) => {
            setShowNew(false)
            setExpandedId(id)
          }}
        />
      )}
    </div>
  )
}

function StatusDot({ tone }: { tone: 'active' | 'neutral' | 'error' | 'warning' }) {
  return (
    <span className="relative flex shrink-0 mt-1.5">
      {tone === 'active' && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-leaf opacity-75 animate-ping" />
      )}
      <span
        className={cn(
          'relative inline-flex rounded-full h-2 w-2',
          tone === 'active' && 'bg-leaf',
          tone === 'error' && 'bg-primary',
          tone === 'warning' && 'bg-warm',
          tone === 'neutral' && 'bg-stone-dark'
        )}
      />
    </span>
  )
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] text-stone-light hover:text-cloud hover:bg-night-lighter transition-colors tracking-tight"
    >
      {copied ? <Check size={12} className="text-leaf" /> : <Copy size={12} />}
      {label ?? (copied ? 'Copiado' : 'Copiar')}
    </button>
  )
}

// =============================================================
// Z-API panel
// =============================================================
function ZapiChannelPanel({
  channel,
  baseUrl,
  onError,
}: {
  channel: Channel
  baseUrl: string
  onError: (msg: string) => void
}) {
  const config = (channel.config ?? {}) as Record<string, unknown>
  const [instanceId, setInstanceId] = useState((config.instance_id as string) ?? '')
  const [token, setToken] = useState((config.token as string) ?? '')
  const [clientToken, setClientToken] = useState((config.client_token as string) ?? '')
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const hasCredentials = Boolean(instanceId && token)
  const webhookSecret = config.webhook_secret as string | undefined
  const webhookUrl = webhookSecret
    ? `${baseUrl}/api/webhooks/zapi/${channel.id}?s=${webhookSecret}`
    : null
  const connectedPhone = config.connected_phone as string | undefined

  function handleSaveCredentials() {
    startTransition(async () => {
      const res = await saveZapiCredentials({
        channelId: channel.id,
        instance_id: instanceId,
        token,
        client_token: clientToken,
      })
      if ('error' in res && res.error) onError(res.error)
    })
  }

  function handleRegisterWebhooks() {
    startTransition(async () => {
      const res = await registerZapiWebhooks(channel.id)
      if (!res.ok) onError(res.error)
    })
  }

  function handleConnect() {
    setShowQrModal(true)
    startTransition(async () => {
      const res = await getZapiQrCode(channel.id)
      if (!res.ok) {
        onError(res.error)
        setShowQrModal(false)
        return
      }
      if (res.connected) {
        setQrData(null)
        await syncZapiConnectedPhone(channel.id)
        setShowQrModal(false)
        return
      }
      setQrData(res.qr ?? null)
    })
  }

  function handleCheckStatus() {
    startTransition(async () => {
      const res = await getZapiStatus(channel.id)
      if (!res.ok) {
        onError(res.error)
        return
      }
      if (res.status.connected) {
        await syncZapiConnectedPhone(channel.id)
      }
    })
  }

  function handleDisconnect() {
    if (!confirm('Desconectar o numero? Sera necessario escanear o QR novamente.'))
      return
    startTransition(async () => {
      const res = await disconnectZapi(channel.id)
      if (!res.ok) onError(res.error)
    })
  }

  function handleRestart() {
    startTransition(async () => {
      const res = await restartZapi(channel.id)
      if (!res.ok) onError(res.error)
    })
  }

  useEffect(() => {
    if (!showQrModal || !qrData) return
    const interval = setInterval(async () => {
      const res = await getZapiStatus(channel.id)
      if (res.ok && res.status.connected) {
        await syncZapiConnectedPhone(channel.id)
        setShowQrModal(false)
        setQrData(null)
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [showQrModal, qrData, channel.id])

  return (
    <div className="space-y-8">
      {/* Credenciais */}
      <section>
        <div className="mb-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Credenciais
          </span>
        </div>
        <div className="space-y-2.5 max-w-xl">
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="Instance ID"
              value={instanceId}
              onChange={setInstanceId}
              placeholder="ABC123..."
              mono
            />
            <Field
              label="Token"
              value={token}
              onChange={setToken}
              placeholder="XYZ..."
              mono
            />
          </div>
          <Field
            label="Client token (opcional)"
            value={clientToken}
            onChange={setClientToken}
            placeholder="Token de seguranca da conta"
            mono
          />
          <div className="pt-1">
            <button
              onClick={handleSaveCredentials}
              disabled={pending || !instanceId || !token}
              className="h-8 px-3.5 bg-night-lighter text-cloud text-[12px] font-medium rounded-md hover:bg-night-lighter/70 transition-colors disabled:opacity-40 tracking-tight"
            >
              Salvar credenciais
            </button>
          </div>
          <p className="text-[11px] text-stone-dark tracking-tight mt-1">
            Obtenha em painel Z-API &rarr; Instancia &rarr; ID, Token e Token de
            seguranca da conta.
          </p>
        </div>
      </section>

      {/* Webhook */}
      {hasCredentials && webhookUrl && (
        <section>
          <div className="mb-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Webhook
            </span>
          </div>
          <div className="max-w-xl space-y-2.5">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-night border border-night-lighter rounded-md">
              <code className="flex-1 text-[11px] font-data text-cloud truncate">
                {webhookUrl}
              </code>
              <CopyButton text={webhookUrl} label="" />
            </div>
            <button
              onClick={handleRegisterWebhooks}
              disabled={pending}
              className="h-8 px-3.5 bg-night-lighter text-cloud text-[12px] font-medium rounded-md hover:bg-night-lighter/70 transition-colors disabled:opacity-40 tracking-tight"
            >
              {pending ? 'Registrando' : 'Registrar webhooks no Z-API'}
            </button>
            <p className="text-[11px] text-stone-dark tracking-tight">
              Registra todos os callbacks do Z-API (recebidas, enviadas, status, presenca, conexao) com notifySentByMe ativo.
            </p>
          </div>
        </section>
      )}

      {/* Conexao */}
      {hasCredentials && (
        <section>
          <div className="mb-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Conexao
            </span>
          </div>
          <div className="max-w-xl">
            {connectedPhone && channel.status === 'active' && (
              <div className="flex items-center gap-2 mb-3 text-[12px] text-stone-light tracking-tight">
                <StatusDot tone="active" />
                Conectado como{' '}
                <span className="font-data text-cloud">{connectedPhone}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {channel.status !== 'active' && (
                <button
                  onClick={handleConnect}
                  disabled={pending}
                  className="h-8 px-3.5 bg-cloud text-night text-[12px] font-medium rounded-md hover:bg-cloud-dark transition-colors disabled:opacity-40 tracking-tight"
                >
                  Conectar via QR
                </button>
              )}
              <button
                onClick={handleCheckStatus}
                disabled={pending}
                className="h-8 px-3.5 text-stone-light text-[12px] font-medium rounded-md hover:text-cloud hover:bg-night-lighter transition-colors disabled:opacity-40 tracking-tight"
              >
                Checar status
              </button>
              <button
                onClick={handleRestart}
                disabled={pending}
                className="h-8 px-3.5 text-stone-light text-[12px] font-medium rounded-md hover:text-cloud hover:bg-night-lighter transition-colors disabled:opacity-40 tracking-tight"
              >
                Reiniciar
              </button>
              {channel.status === 'active' && (
                <button
                  onClick={handleDisconnect}
                  disabled={pending}
                  className="h-8 px-3.5 text-primary text-[12px] font-medium rounded-md hover:bg-primary/10 transition-colors disabled:opacity-40 tracking-tight ml-auto"
                >
                  Desconectar
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* QR Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
          onClick={() => {
            setShowQrModal(false)
            setQrData(null)
          }}
        >
          <div
            className="bg-night-light border border-night-lighter rounded-xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-night-lighter flex items-center justify-between">
              <h2 className="text-[14px] font-medium text-cloud tracking-tight">
                Escaneie o QR code
              </h2>
              <button
                onClick={() => {
                  setShowQrModal(false)
                  setQrData(null)
                }}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-6">
              {qrData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrData}
                  alt="QR code"
                  className="w-full aspect-square bg-white rounded-lg p-3"
                />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center bg-night rounded-lg">
                  <Loader2
                    size={20}
                    strokeWidth={2}
                    className="text-stone animate-spin"
                  />
                </div>
              )}
              <ol className="mt-5 space-y-2 text-[12px] text-stone-light tracking-tight list-decimal list-inside marker:text-stone-dark marker:font-data">
                <li>Abra o WhatsApp no celular</li>
                <li>Configuracoes &rarr; Aparelhos conectados</li>
                <li>Toque em Conectar um aparelho e aponte para o QR</li>
              </ol>
              <p className="text-[10px] text-stone-dark mt-5 tracking-tight flex items-center gap-1.5">
                <Loader2 size={9} className="animate-spin" />
                Aguardando conexao
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================
// Generic (non-Z-API) panel
// =============================================================
function GenericChannelPanel({
  channel,
  baseUrl,
  onToggleStatus,
  onDelete,
  onRotate,
  pending,
}: {
  channel: Channel
  baseUrl: string
  onToggleStatus: (c: Channel) => void
  onDelete: (id: string) => void
  onRotate: (id: string) => void
  pending: boolean
}) {
  const config = (channel.config ?? {}) as Record<string, unknown>
  const meta = CHANNEL_META[channel.type]
  const webhookSecret = config.webhook_secret as string | undefined
  const webhookUrl = webhookSecret
    ? `${baseUrl}/api/webhooks/zapi/${channel.id}?s=${webhookSecret}`
    : null

  return (
    <div className="space-y-6 max-w-xl">
      {meta.hasWebhook && webhookUrl && (
        <section>
          <div className="mb-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Webhook
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-night border border-night-lighter rounded-md">
            <code className="flex-1 text-[11px] font-data text-cloud truncate">
              {webhookUrl}
            </code>
            <CopyButton text={webhookUrl} label="" />
            <button
              onClick={() => onRotate(channel.id)}
              disabled={pending}
              className="text-[11px] text-stone-light hover:text-cloud h-7 px-2 rounded-md hover:bg-night-lighter transition-colors tracking-tight"
            >
              Rotacionar
            </button>
          </div>
        </section>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onToggleStatus(channel)}
          disabled={pending}
          className={cn(
            'h-8 px-3.5 text-[12px] font-medium rounded-md transition-colors disabled:opacity-40 tracking-tight',
            channel.status === 'active'
              ? 'text-stone-light hover:text-cloud hover:bg-night-lighter'
              : 'bg-cloud text-night hover:bg-cloud-dark'
          )}
        >
          {channel.status === 'active' ? 'Desativar' : 'Ativar'}
        </button>
        <button
          onClick={() => onDelete(channel.id)}
          disabled={pending}
          className="h-8 px-3.5 text-primary text-[12px] font-medium rounded-md hover:bg-primary/10 transition-colors disabled:opacity-40 tracking-tight ml-auto"
        >
          Remover
        </button>
      </div>

      {channel.last_synced_at && (
        <p className="text-[10px] text-stone-dark tracking-tight">
          Ultima sincronizacao:{' '}
          {new Date(channel.last_synced_at).toLocaleString('pt-BR')}
        </p>
      )}
      {channel.last_error && (
        <p className="text-[10px] text-primary tracking-tight">
          Ultimo erro: {channel.last_error}
        </p>
      )}
    </div>
  )
}

// =============================================================
// Primitives
// =============================================================
function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-1.5">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full h-9 px-3 bg-night border border-night-lighter rounded-md text-[12px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors',
          mono && 'font-data'
        )}
      />
    </div>
  )
}

function NewChannelModal({
  onClose,
  onError,
  onCreated,
}: {
  onClose: () => void
  onError: (msg: string) => void
  onCreated: (id: string) => void
}) {
  const [type, setType] = useState<ChannelType>('whatsapp_zapi')
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const res = await createChannel({ type, name })
      if ('error' in res && res.error) {
        onError(res.error)
        return
      }
      if ('channelId' in res && res.channelId) onCreated(res.channelId)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-cloud tracking-tight">
            Novo canal
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-2.5">
              Tipo
            </label>
            <div className="border border-night-lighter rounded-md divide-y divide-night-lighter overflow-hidden">
              {(Object.keys(CHANNEL_META) as ChannelType[]).map((t) => {
                const meta = CHANNEL_META[t]
                const active = type === t
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={cn(
                      'w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors',
                      active
                        ? 'bg-night-lighter'
                        : 'hover:bg-night-lighter/50'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-cloud tracking-tight">
                        {meta.label}
                      </p>
                      <p className="text-[11px] text-stone tracking-tight truncate">
                        {meta.description}
                      </p>
                    </div>
                    {active && (
                      <Check size={13} strokeWidth={2.5} className="text-cloud shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-2">
              Nome
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: WhatsApp principal"
              className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark transition-colors"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={pending || name.trim().length === 0}
              className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
            >
              {pending ? 'Criando' : 'Criar canal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
