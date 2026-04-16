'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  parseISO,
  addMonths,
  subMonths,
  isToday,
  getHours,
  getMinutes,
  differenceInMinutes,
  startOfDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/page-header'
import { MetricBand } from '@/components/metric-band'
import { TabBar } from '@/components/tab-bar'
import { cn } from '@/lib/utils'
import type { Reservation, Table, Customer, TableStatus } from '@txoko/shared'
import {
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Calendar,
  List,
  AlignLeft,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  UserCheck,
  AlertCircle,
} from 'lucide-react'
import {
  createReservation,
  updateReservation,
  confirmReservation,
  seatReservation,
  completeReservation,
  cancelReservation,
  markNoShow,
} from './actions'
import type { CreateReservationInput } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'calendar' | 'timeline'
type TabKey = 'today' | 'tomorrow' | 'week' | 'month' | 'all'

type ReservationWithRelations = Reservation & {
  customer?: { name: string } | null
  table?: { number: number; capacity: number } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  seated: 'Sentado',
  completed: 'Finalizada',
  cancelled: 'Cancelada',
  no_show: 'Nao compareceu',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-warm bg-warm/10 border-warm/20',
  confirmed: 'text-leaf bg-leaf/10 border-leaf/20',
  seated: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  completed: 'text-stone bg-stone/10 border-stone/20',
  cancelled: 'text-coral bg-coral/10 border-coral/20',
  no_show: 'text-coral bg-coral/10 border-coral/20',
}

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-warm',
  confirmed: 'bg-leaf',
  seated: 'bg-blue-400',
  completed: 'bg-stone',
  cancelled: 'bg-coral',
  no_show: 'bg-coral',
}

const TIMELINE_HOURS = Array.from({ length: 13 }, (_, i) => i + 10) // 10h-22h

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  reservations: Reservation[]
  tables: Pick<Table, 'id' | 'number' | 'capacity' | 'status' | 'area'>[]
  customers: Pick<Customer, 'id' | 'name' | 'phone' | 'email'>[]
  restaurantId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReservasView({
  reservations: initialReservations,
  tables,
  customers,
  restaurantId,
}: Props) {
  const [reservations, setReservations] = useState<ReservationWithRelations[]>(
    initialReservations as ReservationWithRelations[]
  )
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [activeTab, setActiveTab] = useState<TabKey>('today')
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date>(new Date())
  const [timelineDay, setTimelineDay] = useState<Date>(new Date())
  const [showModal, setShowModal] = useState(false)
  const [editingReservation, setEditingReservation] = useState<ReservationWithRelations | null>(null)
  const [cancelModal, setCancelModal] = useState<{ id: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [, startTransition] = useTransition()
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`reservas-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setReservations((prev) => [
              ...prev,
              payload.new as ReservationWithRelations,
            ])
          } else if (payload.eventType === 'UPDATE') {
            setReservations((prev) =>
              prev.map((r) =>
                r.id === (payload.new as Reservation).id
                  ? { ...r, ...(payload.new as ReservationWithRelations) }
                  : r
              )
            )
          } else if (payload.eventType === 'DELETE') {
            setReservations((prev) =>
              prev.filter((r) => r.id !== (payload.old as Reservation).id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId])

  // ─── Computed ──────────────────────────────────────────────────────────────

  const now = new Date()
  const todayStart = startOfDay(now)
  const tomorrowStart = addDays(todayStart, 1)
  const tomorrowEnd = addDays(tomorrowStart, 1)
  const weekEnd = addDays(todayStart, 7)
  const monthEnd = addDays(todayStart, 30)

  const filteredReservations = useMemo(() => {
    switch (activeTab) {
      case 'today':
        return reservations.filter((r) => {
          const d = parseISO(r.scheduled_for)
          return d >= todayStart && d < tomorrowStart
        })
      case 'tomorrow':
        return reservations.filter((r) => {
          const d = parseISO(r.scheduled_for)
          return d >= tomorrowStart && d < tomorrowEnd
        })
      case 'week':
        return reservations.filter((r) => {
          const d = parseISO(r.scheduled_for)
          return d >= todayStart && d < weekEnd
        })
      case 'month':
        return reservations.filter((r) => {
          const d = parseISO(r.scheduled_for)
          return d >= todayStart && d < monthEnd
        })
      default:
        return reservations
    }
  }, [reservations, activeTab, todayStart, tomorrowStart, tomorrowEnd, weekEnd, monthEnd])

  const todayCount = reservations.filter((r) => {
    const d = parseISO(r.scheduled_for)
    return d >= todayStart && d < tomorrowStart
  }).length

  const weekCount = reservations.filter((r) => {
    const d = parseISO(r.scheduled_for)
    return d >= todayStart && d < weekEnd
  }).length

  const confirmedCount = reservations.filter((r) => r.status === 'confirmed').length
  const pendingCount = reservations.filter((r) => r.status === 'pending').length

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function handleAction(action: () => Promise<{ ok?: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        alert(result.error)
      }
    })
  }

  // ─── View: List ────────────────────────────────────────────────────────────

  function ListView() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-night-lighter">
              <th className="text-left py-2 px-3 text-stone font-medium uppercase tracking-[0.06em] text-[10px]">Horario</th>
              <th className="text-left py-2 px-3 text-stone font-medium uppercase tracking-[0.06em] text-[10px]">Cliente</th>
              <th className="text-left py-2 px-3 text-stone font-medium uppercase tracking-[0.06em] text-[10px]">Pessoas</th>
              <th className="text-left py-2 px-3 text-stone font-medium uppercase tracking-[0.06em] text-[10px]">Mesa</th>
              <th className="text-left py-2 px-3 text-stone font-medium uppercase tracking-[0.06em] text-[10px]">Status</th>
              <th className="text-left py-2 px-3 text-stone font-medium uppercase tracking-[0.06em] text-[10px]">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filteredReservations.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-stone text-[12px]">
                  Nenhuma reserva encontrada
                </td>
              </tr>
            )}
            {filteredReservations.map((r) => (
              <tr
                key={r.id}
                className="border-b border-night-lighter/50 hover:bg-night-light/30 transition-colors"
              >
                <td className="py-2.5 px-3">
                  <span className="font-data text-cloud">
                    {format(parseISO(r.scheduled_for), 'dd/MM HH:mm')}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <div>
                    <p className="text-cloud font-medium">{r.guest_name}</p>
                    <p className="text-stone text-[11px]">{r.guest_phone}</p>
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <span className="font-data text-cloud flex items-center gap-1">
                    <Users size={11} className="text-stone" />
                    {r.guest_count}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-stone">
                  {r.table_id
                    ? (() => {
                        const t = tables.find((t) => t.id === r.table_id)
                        return t ? `Mesa ${t.number}` : '—'
                      })()
                    : '—'}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border',
                      STATUS_COLOR[r.status]
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[r.status])} />
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    {r.status === 'pending' && (
                      <button
                        onClick={() => handleAction(() => confirmReservation(r.id))}
                        disabled={actionLoading === r.id}
                        className="text-[10px] px-2 py-0.5 rounded bg-leaf/10 text-leaf hover:bg-leaf/20 border border-leaf/20 transition-colors"
                      >
                        Confirmar
                      </button>
                    )}
                    {(r.status === 'pending' || r.status === 'confirmed') && (
                      <button
                        onClick={() => handleAction(() => seatReservation({ id: r.id, tableId: r.table_id }))}
                        disabled={actionLoading === r.id}
                        className="text-[10px] px-2 py-0.5 rounded bg-blue-400/10 text-blue-400 hover:bg-blue-400/20 border border-blue-400/20 transition-colors"
                      >
                        Sentar
                      </button>
                    )}
                    {r.status === 'seated' && (
                      <button
                        onClick={() => handleAction(() => completeReservation(r.id))}
                        disabled={actionLoading === r.id}
                        className="text-[10px] px-2 py-0.5 rounded bg-stone/10 text-stone hover:bg-stone/20 border border-stone/20 transition-colors"
                      >
                        Finalizar
                      </button>
                    )}
                    {(r.status === 'pending' || r.status === 'confirmed') && (
                      <button
                        onClick={() => handleAction(() => markNoShow(r.id))}
                        disabled={actionLoading === r.id}
                        className="text-[10px] px-2 py-0.5 rounded bg-coral/10 text-coral hover:bg-coral/20 border border-coral/20 transition-colors"
                      >
                        No-show
                      </button>
                    )}
                    {!['completed', 'cancelled', 'no_show'].includes(r.status) && (
                      <button
                        onClick={() => setCancelModal({ id: r.id })}
                        className="text-stone hover:text-coral transition-colors p-1"
                        title="Cancelar"
                      >
                        <XCircle size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => setEditingReservation(r)}
                      className="text-stone hover:text-cloud transition-colors p-1"
                      title="Editar"
                    >
                      <AlignLeft size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ─── View: Calendar ────────────────────────────────────────────────────────

  function CalendarView() {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

    const days: Date[] = []
    let current = calStart
    while (current <= calEnd) {
      days.push(current)
      current = addDays(current, 1)
    }

    const reservationsByDay = reservations.reduce<Record<string, ReservationWithRelations[]>>(
      (acc, r) => {
        const key = format(parseISO(r.scheduled_for), 'yyyy-MM-dd')
        if (!acc[key]) acc[key] = []
        acc[key]!.push(r)
        return acc
      },
      {}
    )

    const dayReservations = reservationsByDay[format(selectedDay, 'yyyy-MM-dd')] ?? []

    return (
      <div className="flex gap-6">
        {/* Calendar Grid */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
              className="p-1.5 rounded hover:bg-night-light transition-colors text-stone hover:text-cloud"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[13px] font-medium text-cloud capitalize">
              {format(calendarMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button
              onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
              className="p-1.5 rounded hover:bg-night-light transition-colors text-stone hover:text-cloud"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((d) => (
              <div key={d} className="text-center text-[10px] text-stone font-medium uppercase tracking-wide py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-px bg-night-lighter">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayRsvs = reservationsByDay[key] ?? []
              const isCurrentMonth = isSameMonth(day, calendarMonth)
              const isSelected = isSameDay(day, selectedDay)
              const isTodayDay = isToday(day)

              return (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedDay(day)
                    if (!isSameMonth(day, calendarMonth)) {
                      setCalendarMonth(day)
                    }
                  }}
                  className={cn(
                    'bg-bg p-1.5 text-left min-h-[64px] transition-colors hover:bg-night-light/50',
                    isSelected && 'bg-night-light',
                    !isCurrentMonth && 'opacity-40'
                  )}
                >
                  <span
                    className={cn(
                      'text-[12px] font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
                      isTodayDay && 'bg-leaf text-night text-[11px] font-bold',
                      !isTodayDay && isSelected && 'text-cloud',
                      !isTodayDay && !isSelected && 'text-stone'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayRsvs.length > 0 && (
                    <div className="flex flex-wrap gap-0.5">
                      {dayRsvs.slice(0, 3).map((r) => (
                        <span
                          key={r.id}
                          className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[r.status])}
                        />
                      ))}
                      {dayRsvs.length > 3 && (
                        <span className="text-[9px] text-stone">+{dayRsvs.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Day detail */}
        <div className="w-[260px] shrink-0">
          <div className="text-[12px] font-medium text-cloud mb-3 capitalize">
            {format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </div>
          <div className="space-y-2">
            {dayReservations.length === 0 && (
              <p className="text-stone text-[12px]">Sem reservas neste dia</p>
            )}
            {dayReservations
              .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
              .map((r) => (
                <div
                  key={r.id}
                  className="bg-night-light rounded-lg p-3 border border-night-lighter"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-cloud font-medium text-[12px]">{r.guest_name}</span>
                    <span
                      className={cn(
                        'text-[9px] font-medium px-1.5 py-0.5 rounded-full border',
                        STATUS_COLOR[r.status]
                      )}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-stone text-[11px]">
                    <span className="flex items-center gap-1 font-data">
                      <Clock size={10} />
                      {format(parseISO(r.scheduled_for), 'HH:mm')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={10} />
                      {r.guest_count}
                    </span>
                  </div>
                  {r.table_id && (
                    <p className="text-stone text-[10px] mt-1">
                      Mesa {tables.find((t) => t.id === r.table_id)?.number ?? '?'}
                    </p>
                  )}
                  <div className="flex gap-1.5 mt-2">
                    {r.status === 'pending' && (
                      <button
                        onClick={() => handleAction(() => confirmReservation(r.id))}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-leaf/10 text-leaf border border-leaf/20"
                      >
                        Confirmar
                      </button>
                    )}
                    {(r.status === 'pending' || r.status === 'confirmed') && (
                      <button
                        onClick={() => handleAction(() => seatReservation({ id: r.id, tableId: r.table_id }))}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 border border-blue-400/20"
                      >
                        Sentar
                      </button>
                    )}
                    {r.status === 'seated' && (
                      <button
                        onClick={() => handleAction(() => completeReservation(r.id))}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-stone/10 text-stone border border-stone/20"
                      >
                        Finalizar
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── View: Timeline ────────────────────────────────────────────────────────

  function TimelineView() {
    const dayStr = format(timelineDay, 'yyyy-MM-dd')
    const dayRsvs = reservations.filter((r) =>
      format(parseISO(r.scheduled_for), 'yyyy-MM-dd') === dayStr
    )

    const HOUR_WIDTH = 80 // px per hour
    const ROW_HEIGHT = 48 // px per table row
    const LABEL_WIDTH = 80 // left label area

    const totalHours = TIMELINE_HOURS.length

    return (
      <div>
        {/* Timeline nav */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setTimelineDay((d) => addDays(d, -1))}
            className="p-1.5 rounded hover:bg-night-light text-stone hover:text-cloud transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[13px] font-medium text-cloud capitalize">
            {format(timelineDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </span>
          <button
            onClick={() => setTimelineDay((d) => addDays(d, 1))}
            className="p-1.5 rounded hover:bg-night-light text-stone hover:text-cloud transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {tables.length === 0 && (
          <p className="text-stone text-[12px]">Nenhuma mesa cadastrada</p>
        )}

        <div className="overflow-x-auto">
          <div style={{ minWidth: LABEL_WIDTH + totalHours * HOUR_WIDTH }}>
            {/* Hour headers */}
            <div
              className="flex border-b border-night-lighter"
              style={{ paddingLeft: LABEL_WIDTH }}
            >
              {TIMELINE_HOURS.map((h) => (
                <div
                  key={h}
                  className="text-[10px] text-stone text-center border-r border-night-lighter/50 py-1.5 font-data shrink-0"
                  style={{ width: HOUR_WIDTH }}
                >
                  {h.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Table rows */}
            {tables.map((table) => {
              const tableRsvs = dayRsvs.filter((r) => r.table_id === table.id)

              return (
                <div
                  key={table.id}
                  className="relative flex items-center border-b border-night-lighter/50"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Table label */}
                  <div
                    className="shrink-0 px-3 text-[11px] text-stone"
                    style={{ width: LABEL_WIDTH }}
                  >
                    <p className="text-cloud font-medium">Mesa {table.number}</p>
                    <p className="text-stone text-[10px]">{table.capacity} lug.</p>
                  </div>

                  {/* Time slots background */}
                  <div className="relative flex" style={{ height: ROW_HEIGHT }}>
                    {TIMELINE_HOURS.map((h) => (
                      <div
                        key={h}
                        className="border-r border-night-lighter/30 shrink-0"
                        style={{ width: HOUR_WIDTH, height: ROW_HEIGHT }}
                      />
                    ))}

                    {/* Reservation bars */}
                    {tableRsvs.map((r) => {
                      const startDate = parseISO(r.scheduled_for)
                      const startHour = getHours(startDate)
                      const startMin = getMinutes(startDate)
                      const offsetHours = startHour - TIMELINE_HOURS[0]!
                      const leftPx = offsetHours * HOUR_WIDTH + (startMin / 60) * HOUR_WIDTH
                      const widthPx = (r.duration_minutes / 60) * HOUR_WIDTH

                      if (leftPx < 0 || leftPx > totalHours * HOUR_WIDTH) return null

                      return (
                        <div
                          key={r.id}
                          className={cn(
                            'absolute top-2 rounded px-1.5 text-[9px] font-medium overflow-hidden border cursor-pointer hover:opacity-90 transition-opacity',
                            STATUS_COLOR[r.status]
                          )}
                          style={{
                            left: leftPx,
                            width: Math.max(widthPx - 4, 24),
                            height: ROW_HEIGHT - 16,
                            lineHeight: `${ROW_HEIGHT - 20}px`,
                          }}
                          title={`${r.guest_name} - ${r.guest_count} pax - ${STATUS_LABEL[r.status]}`}
                        >
                          <span className="truncate block">{r.guest_name}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Unassigned row */}
            {dayRsvs.filter((r) => !r.table_id).length > 0 && (
              <div
                className="relative flex items-center border-b border-night-lighter/50"
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="shrink-0 px-3 text-[11px] text-stone italic"
                  style={{ width: LABEL_WIDTH }}
                >
                  Sem mesa
                </div>
                <div className="relative flex" style={{ height: ROW_HEIGHT }}>
                  {TIMELINE_HOURS.map((h) => (
                    <div
                      key={h}
                      className="border-r border-night-lighter/30 shrink-0"
                      style={{ width: HOUR_WIDTH, height: ROW_HEIGHT }}
                    />
                  ))}
                  {dayRsvs
                    .filter((r) => !r.table_id)
                    .map((r) => {
                      const startDate = parseISO(r.scheduled_for)
                      const startHour = getHours(startDate)
                      const startMin = getMinutes(startDate)
                      const offsetHours = startHour - TIMELINE_HOURS[0]!
                      const leftPx = offsetHours * HOUR_WIDTH + (startMin / 60) * HOUR_WIDTH
                      const widthPx = (r.duration_minutes / 60) * HOUR_WIDTH

                      if (leftPx < 0 || leftPx > totalHours * HOUR_WIDTH) return null

                      return (
                        <div
                          key={r.id}
                          className={cn(
                            'absolute top-2 rounded px-1.5 text-[9px] font-medium overflow-hidden border',
                            STATUS_COLOR[r.status]
                          )}
                          style={{
                            left: leftPx,
                            width: Math.max(widthPx - 4, 24),
                            height: ROW_HEIGHT - 16,
                            lineHeight: `${ROW_HEIGHT - 20}px`,
                          }}
                        >
                          <span className="truncate block">{r.guest_name}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── New/Edit Modal ─────────────────────────────────────────────────────────

  function ReservationModal({
    initial,
    onClose,
  }: {
    initial?: ReservationWithRelations | null
    onClose: () => void
  }) {
    const isEditing = !!initial?.id

    const [form, setForm] = useState<CreateReservationInput>({
      guest_name: initial?.guest_name ?? '',
      guest_phone: initial?.guest_phone ?? '',
      guest_email: initial?.guest_email ?? '',
      guest_count: initial?.guest_count ?? 2,
      scheduled_for: initial?.scheduled_for
        ? format(parseISO(initial.scheduled_for), "yyyy-MM-dd'T'HH:mm")
        : format(new Date(), "yyyy-MM-dd'T'") + '19:00',
      duration_minutes: initial?.duration_minutes ?? 90,
      table_id: initial?.table_id ?? null,
      notes: initial?.notes ?? '',
      special_requests: initial?.special_requests ?? '',
      source: 'manual',
    })

    const [customerSearch, setCustomerSearch] = useState('')
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const suggestions = useMemo(() => {
      if (!customerSearch || customerSearch.length < 2) return []
      const q = customerSearch.toLowerCase()
      return customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.phone && c.phone.includes(q))
        )
        .slice(0, 6)
    }, [customerSearch])

    function selectCustomer(c: Pick<Customer, 'id' | 'name' | 'phone' | 'email'>) {
      setForm((f) => ({
        ...f,
        guest_name: c.name,
        guest_phone: c.phone ?? '',
        guest_email: c.email ?? '',
      }))
      setCustomerSearch(c.name)
      setShowSuggestions(false)
    }

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      setSubmitting(true)
      setFormError(null)

      let result: { ok?: boolean; error?: string }
      if (isEditing && initial?.id) {
        result = await updateReservation({
          id: initial.id,
          ...form,
        })
      } else {
        result = await createReservation(form)
      }

      setSubmitting(false)
      if (result.error) {
        setFormError(result.error)
      } else {
        onClose()
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-night/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative bg-bg border border-night-lighter rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
          <div className="flex items-center justify-between p-5 border-b border-night-lighter">
            <h2 className="text-[15px] font-medium text-cloud">
              {isEditing ? 'Editar reserva' : 'Nova reserva'}
            </h2>
            <button onClick={onClose} className="text-stone hover:text-cloud transition-colors">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Customer autocomplete */}
            <div className="relative">
              <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
                Nome do cliente
              </label>
              <input
                type="text"
                value={form.guest_name || customerSearch}
                onChange={(e) => {
                  setForm((f) => ({ ...f, guest_name: e.target.value }))
                  setCustomerSearch(e.target.value)
                  setShowSuggestions(true)
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Digite o nome..."
                className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud placeholder:text-stone outline-none focus:border-leaf/50 transition-colors"
                required
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-night-light border border-night-lighter rounded-lg shadow-xl z-10 overflow-hidden">
                  {suggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2 text-[12px] hover:bg-night-lighter transition-colors"
                    >
                      <p className="text-cloud">{c.name}</p>
                      <p className="text-stone text-[11px]">{c.phone}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
                Telefone (WhatsApp)
              </label>
              <input
                type="tel"
                value={form.guest_phone}
                onChange={(e) => setForm((f) => ({ ...f, guest_phone: e.target.value }))}
                placeholder="(11) 99999-9999"
                className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud placeholder:text-stone outline-none focus:border-leaf/50 transition-colors"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
                E-mail (opcional)
              </label>
              <input
                type="email"
                value={form.guest_email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, guest_email: e.target.value }))}
                placeholder="email@exemplo.com"
                className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud placeholder:text-stone outline-none focus:border-leaf/50 transition-colors"
              />
            </div>

            {/* Date/time + people */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
                  Data e hora
                </label>
                <input
                  type="datetime-local"
                  value={form.scheduled_for}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_for: e.target.value }))}
                  className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud outline-none focus:border-leaf/50 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
                  Numero de pessoas
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={form.guest_count}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, guest_count: parseInt(e.target.value) || 1 }))
                  }
                  className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud outline-none focus:border-leaf/50 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Duration + Table */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
                  Duracao (min)
                </label>
                <select
                  value={form.duration_minutes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, duration_minutes: parseInt(e.target.value) }))
                  }
                  className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud outline-none focus:border-leaf/50 transition-colors"
                >
                  <option value={30}>30 min</option>
                  <option value={60}>1 hora</option>
                  <option value={90}>1h 30min</option>
                  <option value={120}>2 horas</option>
                  <option value={150}>2h 30min</option>
                  <option value={180}>3 horas</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
                  Mesa (opcional)
                </label>
                <select
                  value={form.table_id ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      table_id: e.target.value || null,
                    }))
                  }
                  className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud outline-none focus:border-leaf/50 transition-colors"
                >
                  <option value="">Sem mesa</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      Mesa {t.number} ({t.capacity} lug.)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
                Observacoes
              </label>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Notas internas..."
                className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud placeholder:text-stone outline-none focus:border-leaf/50 transition-colors resize-none"
              />
            </div>

            {/* Special requests */}
            <div>
              <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
                Pedidos especiais
              </label>
              <textarea
                value={form.special_requests ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, special_requests: e.target.value }))}
                rows={2}
                placeholder="Aniversario, restricoes alimentares, cadeirinha..."
                className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud placeholder:text-stone outline-none focus:border-leaf/50 transition-colors resize-none"
              />
            </div>

            {formError && (
              <p className="text-coral text-[12px] bg-coral/10 border border-coral/20 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-night-lighter text-stone hover:text-cloud text-[13px] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2 rounded-lg bg-leaf text-night font-medium text-[13px] hover:bg-leaf/90 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Salvando...' : isEditing ? 'Salvar alteracoes' : 'Criar reserva'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ─── Cancel Modal ───────────────────────────────────────────────────────────

  function CancelModal() {
    if (!cancelModal) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-night/60 backdrop-blur-sm"
          onClick={() => setCancelModal(null)}
        />
        <div className="relative bg-bg border border-night-lighter rounded-xl w-full max-w-sm p-5 shadow-xl">
          <h2 className="text-[15px] font-medium text-cloud mb-4">Cancelar reserva</h2>
          <div>
            <label className="block text-[11px] text-stone mb-1.5 uppercase tracking-wide font-medium">
              Motivo (opcional)
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex: cliente solicitou cancelamento"
              className="w-full bg-night-light border border-night-lighter rounded-lg px-3 py-2 text-[13px] text-cloud placeholder:text-stone outline-none focus:border-coral/50 transition-colors"
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setCancelModal(null)}
              className="flex-1 py-2 rounded-lg border border-night-lighter text-stone hover:text-cloud text-[13px] transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={() => {
                handleAction(() =>
                  cancelReservation({ id: cancelModal.id, reason: cancelReason || undefined })
                )
                setCancelModal(null)
                setCancelReason('')
              }}
              className="flex-1 py-2 rounded-lg bg-coral text-white font-medium text-[13px] hover:bg-coral/90 transition-colors"
            >
              Cancelar reserva
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const viewTabs = [
    { key: 'today', label: 'Hoje', count: todayCount },
    { key: 'tomorrow', label: 'Amanha' },
    { key: 'week', label: 'Semana', count: weekCount },
    { key: 'month', label: 'Mes' },
    { key: 'all', label: 'Todas' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Reservas"
        subtitle="Gerencie reservas de mesas"
        action={
          <button
            onClick={() => {
              setEditingReservation(null)
              setShowModal(true)
            }}
            className="inline-flex items-center gap-2 bg-leaf text-night px-3.5 py-2 rounded-lg text-[13px] font-medium hover:bg-leaf/90 transition-colors"
          >
            <Plus size={14} />
            Nova reserva
          </button>
        }
      />

      <div className="mt-5">
        <MetricBand
          metrics={[
            { label: 'Hoje', value: String(todayCount), tone: 'neutral' },
            { label: 'Esta semana', value: String(weekCount), tone: 'neutral' },
            { label: 'Confirmadas', value: String(confirmedCount), tone: 'positive' },
            { label: 'Pendentes', value: String(pendingCount), tone: confirmedCount > 0 ? 'neutral' : 'negative' },
          ]}
        />
      </div>

      {/* View mode selector */}
      <div className="flex items-center justify-between mb-4">
        <TabBar
          tabs={viewTabs}
          active={activeTab}
          onChange={(k) => setActiveTab(k as TabKey)}
          className="flex-1"
        />
        <div className="flex items-center gap-1 ml-4 bg-night-light rounded-lg p-1 border border-night-lighter">
          {(
            [
              { key: 'list', icon: List, label: 'Lista' },
              { key: 'calendar', icon: Calendar, label: 'Agenda' },
              { key: 'timeline', icon: AlignLeft, label: 'Linha do tempo' },
            ] as const
          ).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              title={label}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === key
                  ? 'bg-night-lighter text-cloud'
                  : 'text-stone hover:text-cloud'
              )}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mt-2">
        {viewMode === 'list' && <ListView />}
        {viewMode === 'calendar' && <CalendarView />}
        {viewMode === 'timeline' && <TimelineView />}
      </div>

      {/* Modals */}
      {(showModal || editingReservation) && (
        <ReservationModal
          initial={editingReservation}
          onClose={() => {
            setShowModal(false)
            setEditingReservation(null)
          }}
        />
      )}
      <CancelModal />
    </div>
  )
}
