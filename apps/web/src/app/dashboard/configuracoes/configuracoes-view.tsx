'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  Clock,
  CheckCircle2,
  Crown,
  Inbox,
  Percent,
  Plug,
  Settings,
  Star,
  Store,
} from 'lucide-react'
import { updateRestaurant } from './actions'

export type RestaurantFormData = {
  id: string
  name: string
  legal_name: string
  cnpj: string
  phone: string
  email: string
  address_full: string
  service_rate: number
  open_time: string
  close_time: string
  loyalty_points_per: number
  timezone: string
  currency: string
}

const INTEGRATIONS = [
  { id: 'ifood', name: 'iFood', description: 'Receba pedidos do iFood diretamente no hub', status: 'em_breve' },
  { id: 'rappi', name: 'Rappi', description: 'Integre pedidos Rappi ao seu sistema', status: 'em_breve' },
  { id: 'whatsapp', name: 'WhatsApp Business', description: 'Chatbot para pedidos e atendimento', status: 'em_breve' },
  { id: 'stone', name: 'Stone', description: 'TEF integrado para pagamentos', status: 'em_breve' },
  { id: 'sefaz', name: 'SEFAZ', description: 'Emissao automatica de NFC-e/NF-e', status: 'em_breve' },
  { id: 'google', name: 'Google Meu Negocio', description: 'Sincronize avaliacoes e horarios', status: 'em_breve' },
]

const PLAN_FEATURES = [
  'PDV completo + comanda eletronica',
  'Pedidos ilimitados',
  'Ate 10 usuarios',
  'Modulo financeiro completo',
  'Estoque + ficha tecnica',
  'Delivery proprio',
  'Assistente IA',
  '20+ automacoes',
  'CRM + fidelidade',
  'KDS inteligente',
  'NFC-e automatica',
]

export function ConfiguracoesView({ initial }: { initial: RestaurantFormData }) {
  const [form, setForm] = useState<RestaurantFormData>(initial)
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function update<K extends keyof RestaurantFormData>(key: K, value: RestaurantFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    setFeedback(null)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await updateRestaurant({
        id: form.id,
        name: form.name,
        legal_name: form.legal_name || null,
        cnpj: form.cnpj || null,
        phone: form.phone || null,
        email: form.email || null,
        address_full: form.address_full || null,
        settings: {
          service_rate: form.service_rate,
          open_time: form.open_time,
          close_time: form.close_time,
          timezone: form.timezone,
          currency: form.currency,
          loyalty_points_per: form.loyalty_points_per,
        },
      })
      if ('error' in res && res.error) {
        setFeedback('error')
        setErrorMsg(res.error)
        return
      }
      setFeedback('saved')
      setTimeout(() => setFeedback(null), 2500)
    })
  }

  const inputClass =
    'w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors'
  const labelClass = 'block text-sm text-stone-light mb-1'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-stone/10">
          <Settings size={20} className="text-stone-light" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-cloud">Configuracoes</h1>
          <p className="text-sm text-stone">Restaurante, operacao e integracoes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
            <Store size={14} className="text-stone-light" />
            <h2 className="text-sm font-semibold text-cloud">Dados do Restaurante</h2>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className={labelClass}>Nome fantasia</label>
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Razao social</label>
              <input
                value={form.legal_name}
                onChange={(e) => update('legal_name', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>CNPJ</label>
              <input
                value={form.cnpj}
                onChange={(e) => update('cnpj', e.target.value)}
                placeholder="00.000.000/0000-00"
                className={`${inputClass} font-data`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Telefone</label>
                <input
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Endereco</label>
              <input
                value={form.address_full}
                onChange={(e) => update('address_full', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-night-light border border-night-lighter rounded-xl">
            <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
              <Clock size={14} className="text-stone-light" />
              <h2 className="text-sm font-semibold text-cloud">Horario de Funcionamento</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Abertura</label>
                <input
                  type="time"
                  value={form.open_time}
                  onChange={(e) => update('open_time', e.target.value)}
                  className={`${inputClass} font-data`}
                />
              </div>
              <div>
                <label className={labelClass}>Fechamento</label>
                <input
                  type="time"
                  value={form.close_time}
                  onChange={(e) => update('close_time', e.target.value)}
                  className={`${inputClass} font-data`}
                />
              </div>
            </div>
          </div>

          <div className="bg-night-light border border-night-lighter rounded-xl">
            <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
              <Percent size={14} className="text-stone-light" />
              <h2 className="text-sm font-semibold text-cloud">Taxa de Servico</h2>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.service_rate}
                  onChange={(e) => update('service_rate', parseFloat(e.target.value) || 0)}
                  className={`w-24 ${inputClass} font-data text-center`}
                />
                <span className="text-sm text-stone">%</span>
              </div>
              <p className="text-xs text-stone mt-2">
                Aplicada automaticamente em pedidos do salao (dine_in). Hoje hardcoded em 10% no
                PDV — sera lida desse valor nas proximas iteracoes.
              </p>
            </div>
          </div>

          <div className="bg-night-light border border-night-lighter rounded-xl">
            <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
              <Star size={14} className="text-stone-light" />
              <h2 className="text-sm font-semibold text-cloud">Fidelidade</h2>
            </div>
            <div className="p-5">
              <label className={labelClass}>Pontos por real gasto</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone">1 ponto a cada R$</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.loyalty_points_per}
                  onChange={(e) => update('loyalty_points_per', parseFloat(e.target.value) || 10)}
                  className={`w-20 ${inputClass} font-data text-center`}
                />
              </div>
              <p className="text-xs text-stone mt-2">
                Hoje fixo em R$ 10 no trigger SQL. O campo e salvo mas aplicar dinamicamente
                requer alterar a function <code className="text-leaf">update_loyalty_on_order_closed</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Link
        href="/dashboard/configuracoes/canais"
        className="block bg-night-light border border-primary/20 rounded-xl hover:border-primary/40 transition-colors"
      >
        <div className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <Inbox size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-cloud">Canais de atendimento</h2>
            <p className="text-xs text-stone mt-0.5">
              Conecte WhatsApp (Z-API), Instagram, Messenger, iFood e Google ao seu Inbox
            </p>
          </div>
          <ChevronRight size={18} className="text-stone" />
        </div>
      </Link>

      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
          <Plug size={14} className="text-stone-light" />
          <h2 className="text-sm font-semibold text-cloud">Integracoes</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
          {INTEGRATIONS.map((integ) => (
            <div
              key={integ.id}
              className="border border-night-lighter rounded-xl p-4 opacity-70"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-cloud text-sm">{integ.name}</h3>
                <span className="px-2 py-1 rounded-lg text-[10px] font-medium bg-night-lighter text-stone">
                  Em breve
                </span>
              </div>
              <p className="text-xs text-stone">{integ.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-night-light border border-primary/20 rounded-xl">
        <div className="px-5 py-3 border-b border-night-lighter flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown size={14} className="text-warm" />
            <h2 className="text-sm font-semibold text-cloud">Plano Atual</h2>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary">
            Pro — R$ 299/mes
          </span>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {PLAN_FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-xs text-stone-light">
                <CheckCircle2 size={14} className="text-leaf shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>

      {feedback === 'error' && errorMsg && (
        <div className="px-4 py-3 bg-coral/10 border border-coral/30 rounded-xl text-sm text-coral">
          {errorMsg}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={pending}
        className={cn(
          'w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50',
          feedback === 'saved'
            ? 'bg-primary/10 text-primary'
            : 'bg-primary text-white hover:bg-primary-hover'
        )}
      >
        {pending
          ? 'Salvando...'
          : feedback === 'saved'
          ? 'Configuracoes salvas!'
          : 'Salvar Configuracoes'}
      </button>
    </div>
  )
}
