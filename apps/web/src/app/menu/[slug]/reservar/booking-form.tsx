'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, addDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { ArrowLeft, CalendarDays, Clock, Users, CheckCircle2 } from 'lucide-react'

type Props = {
  restaurantName: string
  slug: string
}

// Available time slots
const TIME_SLOTS = [
  '12:00', '12:30', '13:00', '13:30', '14:00',
  '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00',
]

// Generate next 30 days (excluding today if past 22h)
function getAvailableDays(): Date[] {
  const days: Date[] = []
  const now = new Date()
  const startDay = now.getHours() >= 22 ? addDays(now, 1) : now
  for (let i = 0; i < 30; i++) {
    days.push(addDays(startDay, i))
  }
  return days
}

type SuccessInfo = {
  guest_name: string
  scheduled_for: string
  guest_count: number
  restaurantName: string
  reservationId: string
}

export function PublicBookingForm({ restaurantName, slug }: Props) {
  const availableDays = getAvailableDays()

  const [step, setStep] = useState<'form' | 'success'>('form')
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState({
    guest_name: '',
    guest_phone: '',
    guest_email: '',
    guest_count: 2,
    selected_date: format(availableDays[0]!, 'yyyy-MM-dd'),
    selected_time: '19:00',
    special_requests: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)

    const scheduled_for = `${form.selected_date}T${form.selected_time}:00`

    try {
      const res = await fetch('/api/menu/reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantSlug: slug,
          guest_name: form.guest_name,
          guest_phone: form.guest_phone,
          guest_email: form.guest_email || undefined,
          guest_count: form.guest_count,
          scheduled_for,
          special_requests: form.special_requests || undefined,
        }),
      })

      const json = (await res.json()) as { ok: boolean; error?: string; reservationId?: string; restaurantName?: string }

      if (!json.ok) {
        setFormError(json.error ?? 'Erro ao solicitar reserva')
        setSubmitting(false)
        return
      }

      setSuccessInfo({
        guest_name: form.guest_name,
        scheduled_for,
        guest_count: form.guest_count,
        restaurantName,
        reservationId: json.reservationId ?? '',
      })
      setStep('success')
    } catch {
      setFormError('Erro de conexao. Tente novamente.')
    }

    setSubmitting(false)
  }

  if (step === 'success' && successInfo) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-5">
            <CheckCircle2 size={56} className="text-leaf" strokeWidth={1.5} />
          </div>
          <h1 className="text-[22px] font-semibold text-cloud mb-2">
            Reserva solicitada!
          </h1>
          <p className="text-stone text-[14px] mb-6">
            Voce recebera confirmacao em breve.
          </p>

          <div className="bg-night-light border border-night-lighter rounded-xl p-5 text-left space-y-3 mb-6">
            <div className="flex items-center gap-3">
              <CalendarDays size={16} className="text-leaf shrink-0" />
              <div>
                <p className="text-[11px] text-stone uppercase tracking-wide">Data e hora</p>
                <p className="text-cloud text-[13px] font-medium capitalize">
                  {format(parseISO(successInfo.scheduled_for), "EEEE, d 'de' MMMM 'as' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Users size={16} className="text-leaf shrink-0" />
              <div>
                <p className="text-[11px] text-stone uppercase tracking-wide">Pessoas</p>
                <p className="text-cloud text-[13px] font-medium">
                  {successInfo.guest_count} {successInfo.guest_count === 1 ? 'pessoa' : 'pessoas'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CalendarDays size={16} className="text-leaf shrink-0" />
              <div>
                <p className="text-[11px] text-stone uppercase tracking-wide">Restaurante</p>
                <p className="text-cloud text-[13px] font-medium">{successInfo.restaurantName}</p>
              </div>
            </div>
          </div>

          <Link
            href={`/menu/${slug}`}
            className="inline-flex items-center gap-2 text-stone hover:text-cloud text-[13px] transition-colors"
          >
            <ArrowLeft size={14} />
            Voltar ao cardapio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-night-lighter px-4 py-3 flex items-center gap-3">
        <Link
          href={`/menu/${slug}`}
          className="text-stone hover:text-cloud transition-colors p-1 -ml-1"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-[14px] font-semibold text-cloud">Fazer reserva</h1>
          <p className="text-[11px] text-stone">{restaurantName}</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-md mx-auto p-4 space-y-5 pb-8">

        {/* Guest info */}
        <div className="space-y-3">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-stone">
            Seus dados
          </h2>

          <div>
            <label className="block text-[11px] text-stone mb-1">Nome completo</label>
            <input
              type="text"
              required
              minLength={2}
              value={form.guest_name}
              onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))}
              placeholder="Seu nome"
              className="w-full bg-night-light border border-night-lighter rounded-xl px-4 py-3 text-[14px] text-cloud placeholder:text-stone outline-none focus:border-leaf/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] text-stone mb-1">Telefone (WhatsApp)</label>
            <input
              type="tel"
              required
              value={form.guest_phone}
              onChange={(e) => setForm((f) => ({ ...f, guest_phone: e.target.value }))}
              placeholder="(11) 99999-9999"
              className="w-full bg-night-light border border-night-lighter rounded-xl px-4 py-3 text-[14px] text-cloud placeholder:text-stone outline-none focus:border-leaf/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] text-stone mb-1">E-mail (opcional)</label>
            <input
              type="email"
              value={form.guest_email}
              onChange={(e) => setForm((f) => ({ ...f, guest_email: e.target.value }))}
              placeholder="seu@email.com"
              className="w-full bg-night-light border border-night-lighter rounded-xl px-4 py-3 text-[14px] text-cloud placeholder:text-stone outline-none focus:border-leaf/50 transition-colors"
            />
          </div>
        </div>

        {/* Guest count */}
        <div>
          <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-stone mb-3">
            Numero de pessoas
          </h2>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setForm((f) => ({ ...f, guest_count: n }))}
                className={cn(
                  'w-12 h-12 rounded-xl text-[14px] font-medium border transition-colors',
                  form.guest_count === n
                    ? 'bg-leaf text-night border-leaf'
                    : 'bg-night-light border-night-lighter text-stone hover:text-cloud'
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-stone text-[11px] mt-1.5">
            Para grupos maiores, entre em contato diretamente.
          </p>
        </div>

        {/* Date */}
        <div>
          <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-stone mb-3">
            Data
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {availableDays.slice(0, 14).map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const isSelected = form.selected_date === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, selected_date: key }))}
                  className={cn(
                    'shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border transition-colors min-w-[54px]',
                    isSelected
                      ? 'bg-leaf text-night border-leaf'
                      : 'bg-night-light border-night-lighter text-stone hover:text-cloud'
                  )}
                >
                  <span className="text-[10px] uppercase font-medium capitalize">
                    {format(day, 'EEE', { locale: ptBR })}
                  </span>
                  <span className="text-[16px] font-bold">{format(day, 'd')}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Time */}
        <div>
          <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-stone mb-3">
            Horario
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {TIME_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setForm((f) => ({ ...f, selected_time: slot }))}
                className={cn(
                  'py-2.5 rounded-xl text-[13px] font-medium border transition-colors',
                  form.selected_time === slot
                    ? 'bg-leaf text-night border-leaf'
                    : 'bg-night-light border-night-lighter text-stone hover:text-cloud'
                )}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        {/* Special requests */}
        <div>
          <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-stone mb-3">
            Pedidos especiais (opcional)
          </h2>
          <textarea
            value={form.special_requests}
            onChange={(e) => setForm((f) => ({ ...f, special_requests: e.target.value }))}
            rows={3}
            placeholder="Aniversario, restricoes alimentares, necessidades especiais..."
            className="w-full bg-night-light border border-night-lighter rounded-xl px-4 py-3 text-[14px] text-cloud placeholder:text-stone outline-none focus:border-leaf/50 transition-colors resize-none"
          />
        </div>

        {formError && (
          <p className="text-coral text-[13px] bg-coral/10 border border-coral/20 rounded-xl px-4 py-3">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 bg-leaf text-night font-semibold text-[15px] rounded-xl hover:bg-leaf/90 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Solicitar reserva'}
        </button>

        <p className="text-center text-stone text-[11px]">
          Voce recebera confirmacao por WhatsApp em breve.
        </p>
      </form>
    </div>
  )
}
