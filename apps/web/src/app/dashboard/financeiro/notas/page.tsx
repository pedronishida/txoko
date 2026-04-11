'use client'

import { useState, useMemo } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { MOCK_INVOICES } from '@/lib/mock-financial'
import { FileText, CheckCircle2, Clock, XCircle, Copy, ExternalLink } from 'lucide-react'

type InvoiceStatus = 'all' | 'authorized' | 'pending' | 'cancelled'

const STATUS_CONFIG = {
  authorized: { label: 'Autorizada', color: 'text-leaf', bg: 'bg-leaf/10', icon: CheckCircle2 },
  pending: { label: 'Pendente', color: 'text-warm', bg: 'bg-warm/10', icon: Clock },
  cancelled: { label: 'Cancelada', color: 'text-coral', bg: 'bg-coral/10', icon: XCircle },
}

export default function NotasPage() {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus>('all')
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const filtered = useMemo(() => {
    return MOCK_INVOICES.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      return true
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [statusFilter])

  const counts = {
    all: MOCK_INVOICES.length,
    authorized: MOCK_INVOICES.filter(i => i.status === 'authorized').length,
    pending: MOCK_INVOICES.filter(i => i.status === 'pending').length,
    cancelled: MOCK_INVOICES.filter(i => i.status === 'cancelled').length,
  }

  const selected = selectedInvoice ? MOCK_INVOICES.find(i => i.id === selectedInvoice) : null

  function handleCopyKey() {
    if (selected?.access_key) {
      navigator.clipboard.writeText(selected.access_key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {(['all', 'authorized', 'pending', 'cancelled'] as const).map(s => {
          const cfg = s === 'all' ? null : STATUS_CONFIG[s]
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'bg-night-light border rounded-xl p-3 text-left transition-colors',
                statusFilter === s ? 'border-leaf/30' : 'border-night-lighter hover:border-night-lighter/80'
              )}
            >
              <p className="text-xs text-stone mb-1">{s === 'all' ? 'Total' : cfg?.label}</p>
              <p className={cn('text-xl font-bold font-data', s === 'all' ? 'text-cloud' : cfg?.color)}>
                {counts[s]}
              </p>
            </button>
          )
        })}
      </div>

      <div className="flex gap-4">
        {/* Invoice List */}
        <div className="flex-1 bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-3 border-b border-night-lighter flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-stone-light" />
              <h2 className="text-sm font-semibold text-cloud">Notas Emitidas</h2>
            </div>
            <span className="text-xs text-stone font-data">{filtered.length} notas</span>
          </div>
          <div className="divide-y divide-night-lighter max-h-[60vh] overflow-y-auto">
            {filtered.map(inv => {
              const cfg = STATUS_CONFIG[inv.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
              const Icon = cfg.icon
              return (
                <button
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv.id)}
                  className={cn(
                    'w-full px-5 py-3 flex items-center gap-4 text-left transition-colors hover:bg-night/30',
                    selectedInvoice === inv.id && 'bg-night/50'
                  )}
                >
                  <Icon size={16} className={cfg.color} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-data font-medium text-cloud">
                        {inv.type.toUpperCase()} #{inv.number}
                      </span>
                      <span className="text-[10px] text-stone">Serie {inv.series}</span>
                    </div>
                    <p className="text-[10px] text-stone font-data mt-0.5">
                      {formatDate(inv.issued_at || inv.created_at)}
                    </p>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', cfg.bg, cfg.color)}>
                    {cfg.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="w-80 bg-night-light border border-night-lighter rounded-xl">
            <div className="px-4 py-3 border-b border-night-lighter">
              <h3 className="font-semibold text-cloud">{selected.type.toUpperCase()} #{selected.number}</h3>
              <p className="text-xs text-stone mt-0.5">Serie {selected.series}</p>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-stone mb-1">Status</p>
                {(() => {
                  const cfg = STATUS_CONFIG[selected.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
                  return (
                    <span className={cn('px-2 py-1 rounded-lg text-xs font-medium', cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                  )
                })()}
              </div>

              <div>
                <p className="text-xs text-stone mb-1">Emissao</p>
                <p className="text-sm text-cloud font-data">{formatDate(selected.issued_at)}</p>
              </div>

              <div>
                <p className="text-xs text-stone mb-1">Pedido</p>
                <p className="text-sm text-leaf font-data">#{selected.order_id?.split('-')[1]}</p>
              </div>

              {selected.access_key && (
                <div>
                  <p className="text-xs text-stone mb-1">Chave de Acesso</p>
                  <div className="flex items-start gap-2">
                    <p className="text-[10px] text-stone-light font-data break-all flex-1 bg-night rounded-lg p-2">
                      {selected.access_key}
                    </p>
                    <button
                      onClick={handleCopyKey}
                      className="p-1.5 text-stone hover:text-leaf transition-colors shrink-0"
                      title="Copiar chave"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  {copied && <p className="text-[10px] text-leaf mt-1">Copiado!</p>}
                </div>
              )}

              {selected.sefaz_response && (
                <div>
                  <p className="text-xs text-stone mb-1">Retorno SEFAZ</p>
                  <p className="text-xs text-stone-light font-data">
                    {(selected.sefaz_response as { code: string; message: string }).code} — {(selected.sefaz_response as { code: string; message: string }).message}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {selected.xml_url && (
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-night-lighter rounded-lg text-xs text-stone-light hover:text-cloud transition-colors">
                    <ExternalLink size={12} />
                    XML
                  </button>
                )}
                {selected.pdf_url && (
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-night-lighter rounded-lg text-xs text-stone-light hover:text-cloud transition-colors">
                    <FileText size={12} />
                    DANFE
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
