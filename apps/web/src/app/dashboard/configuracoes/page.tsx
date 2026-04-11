'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Settings, Store, Clock, Percent, Plug, Crown, CheckCircle2, XCircle } from 'lucide-react'

const INTEGRATIONS = [
  { id: 'ifood', name: 'iFood', description: 'Receba pedidos do iFood diretamente no hub', enabled: true, status: 'connected' },
  { id: 'rappi', name: 'Rappi', description: 'Integre pedidos Rappi ao seu sistema', enabled: true, status: 'connected' },
  { id: 'whatsapp', name: 'WhatsApp Business', description: 'Chatbot para pedidos e atendimento', enabled: false, status: 'disconnected' },
  { id: 'stone', name: 'Stone', description: 'TEF integrado para pagamentos', enabled: true, status: 'connected' },
  { id: 'sefaz', name: 'SEFAZ', description: 'Emissao automatica de NFC-e/NF-e', enabled: true, status: 'connected' },
  { id: 'google', name: 'Google Meu Negocio', description: 'Sincronize avaliacoes e horarios', enabled: false, status: 'disconnected' },
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

export default function ConfiguracoesPage() {
  const [restaurantName, setRestaurantName] = useState('Txoko Restaurante')
  const [cnpj, setCnpj] = useState('12.345.678/0001-90')
  const [phone, setPhone] = useState('(11) 3456-7890')
  const [email, setEmail] = useState('contato@txoko.com.br')
  const [address, setAddress] = useState('Rua dos Pinheiros, 900 — Pinheiros, Sao Paulo - SP')
  const [serviceRate, setServiceRate] = useState('10')
  const [openTime, setOpenTime] = useState('11:30')
  const [closeTime, setCloseTime] = useState('23:00')
  const [integrations, setIntegrations] = useState(INTEGRATIONS)
  const [saved, setSaved] = useState(false)

  function toggleIntegration(id: string) {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, enabled: !i.enabled, status: i.enabled ? 'disconnected' : 'connected' } : i))
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputClass = 'w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-leaf/50 transition-colors'
  const labelClass = 'block text-sm text-stone-light mb-1'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-stone/10">
          <Settings size={20} className="text-stone-light" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-cloud">Configuracoes</h1>
          <p className="text-sm text-stone">Restaurante, integracoes e plano</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Restaurant Info */}
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
            <Store size={14} className="text-stone-light" />
            <h2 className="text-sm font-semibold text-cloud">Dados do Restaurante</h2>
          </div>
          <div className="p-5 space-y-3">
            <div><label className={labelClass}>Nome do Restaurante</label><input value={restaurantName} onChange={e => setRestaurantName(e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>CNPJ</label><input value={cnpj} onChange={e => setCnpj(e.target.value)} className={`${inputClass} font-data`} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Telefone</label><input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></div>
            </div>
            <div><label className={labelClass}>Endereco</label><input value={address} onChange={e => setAddress(e.target.value)} className={inputClass} /></div>
          </div>
        </div>

        {/* Operations */}
        <div className="space-y-4">
          <div className="bg-night-light border border-night-lighter rounded-xl">
            <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
              <Clock size={14} className="text-stone-light" />
              <h2 className="text-sm font-semibold text-cloud">Horario de Funcionamento</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Abertura</label><input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className={`${inputClass} font-data`} /></div>
              <div><label className={labelClass}>Fechamento</label><input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className={`${inputClass} font-data`} /></div>
            </div>
          </div>

          <div className="bg-night-light border border-night-lighter rounded-xl">
            <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
              <Percent size={14} className="text-stone-light" />
              <h2 className="text-sm font-semibold text-cloud">Taxa de Servico</h2>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2">
                <input type="number" value={serviceRate} onChange={e => setServiceRate(e.target.value)} className={`w-20 ${inputClass} font-data text-center`} />
                <span className="text-sm text-stone">%</span>
              </div>
              <p className="text-xs text-stone mt-2">Aplicada automaticamente em pedidos do salao</p>
            </div>
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="px-5 py-3 border-b border-night-lighter flex items-center gap-2">
          <Plug size={14} className="text-stone-light" />
          <h2 className="text-sm font-semibold text-cloud">Integracoes</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
          {integrations.map(integ => (
            <div key={integ.id} className={cn('border rounded-xl p-4 transition-colors', integ.enabled ? 'border-leaf/20 bg-leaf/5' : 'border-night-lighter')}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-cloud text-sm">{integ.name}</h3>
                <button onClick={() => toggleIntegration(integ.id)} className={cn('px-2 py-1 rounded-lg text-[10px] font-medium transition-colors', integ.enabled ? 'bg-leaf/10 text-leaf' : 'bg-night-lighter text-stone')}>
                  {integ.enabled ? 'Conectado' : 'Desconectado'}
                </button>
              </div>
              <p className="text-xs text-stone">{integ.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Plan */}
      <div className="bg-night-light border border-leaf/20 rounded-xl">
        <div className="px-5 py-3 border-b border-night-lighter flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown size={14} className="text-warm" />
            <h2 className="text-sm font-semibold text-cloud">Plano Atual</h2>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-leaf/10 text-leaf">Pro — R$ 299/mes</span>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {PLAN_FEATURES.map(feature => (
              <div key={feature} className="flex items-center gap-2 text-xs text-stone-light">
                <CheckCircle2 size={14} className="text-leaf shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} className={cn('w-full py-3 rounded-xl text-sm font-semibold transition-colors', saved ? 'bg-leaf/10 text-leaf' : 'bg-leaf text-night hover:bg-leaf-dark')}>
        {saved ? 'Configuracoes salvas!' : 'Salvar Configuracoes'}
      </button>
    </div>
  )
}
