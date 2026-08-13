'use client'

import { useState, useTransition } from 'react'
import {
  updateRestaurant,
  updateSelfServicePrices,
  type SelfServicePrices,
} from '../actions'
import { Field, Input, SaveBar, Section } from '../settings-ui'

// Os precos ficam como TEXTO no formulario, nao como numero. Se o input for
// controlado pelo numero ja convertido, digitar "59," vira 59 e a virgula
// some antes do proximo digito — o campo fica impossivel de preencher.
// A conversao acontece so no save.
export type SelfServicePricesInput = {
  avontade: string
  por_kg: string
  por_kg_2mix: string
}

export type OperacaoFormData = {
  id: string
  service_rate: number
  open_time: string
  close_time: string
  loyalty_points_per: number
  timezone: string
  currency: string
  self_service: SelfServicePricesInput
}

// Campo vazio = modalidade nao usada. Aceita "59,90", "59.90" e ate
// "1.234,56" (se tem virgula, ela e o decimal e os pontos sao milhar).
function parsePrice(v: string): number | null {
  const raw = v.trim()
  if (!raw) return null
  const clean = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  const n = parseFloat(clean)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function OperacaoView({ initial }: { initial: OperacaoFormData }) {
  const [form, setForm] = useState<OperacaoFormData>(initial)
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function update<K extends keyof OperacaoFormData>(
    key: K,
    value: OperacaoFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    setFeedback(null)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await updateRestaurant({
        id: form.id,
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

      // Precos do self-service vivem em produtos, nao em settings
      const ss = await updateSelfServicePrices({
        restaurantId: form.id,
        prices: {
          avontade: parsePrice(form.self_service.avontade),
          por_kg: parsePrice(form.self_service.por_kg),
          por_kg_2mix: parsePrice(form.self_service.por_kg_2mix),
        },
      })
      if (!ss.ok) {
        setFeedback('error')
        setErrorMsg(ss.error ?? 'Erro ao salvar precos do self-service')
        return
      }

      setFeedback('saved')
      setTimeout(() => setFeedback(null), 2500)
    })
  }

  function updateSelfService(mode: keyof SelfServicePricesInput, raw: string) {
    // Guarda o texto como digitado — so numeros, virgula e ponto
    const clean = raw.replace(/[^\d.,]/g, '')
    setForm((prev) => ({
      ...prev,
      self_service: { ...prev.self_service, [mode]: clean },
    }))
  }

  return (
    <div className="max-w-3xl">
      <Section
        title="Horario de funcionamento"
        description="Padrao usado pelo agente IA, automacoes e relatorios. Pra horarios diferenciados por dia da semana, configure em Assistente IA."
      >
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <Field label="Abertura">
            <Input
              type="time"
              value={form.open_time}
              onChange={(v) => update('open_time', v)}
              mono
            />
          </Field>
          <Field label="Fechamento">
            <Input
              type="time"
              value={form.close_time}
              onChange={(v) => update('close_time', v)}
              mono
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Self-service (estacao da balanca)"
        description="Precos das modalidades que a atendente escolhe na balanca. Deixe em branco a modalidade que o restaurante nao usa."
      >
        <div className="grid gap-4 sm:grid-cols-3 max-w-2xl">
          <Field label="A vontade" hint="Por pessoa">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] text-muted tracking-tight">R$</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.self_service.avontade}
                onChange={(v) => updateSelfService('avontade', v)}
                className="w-24 text-right"
                mono
              />
            </div>
          </Field>

          <Field label="Por quilo" hint="Por kg">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] text-muted tracking-tight">R$</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.self_service.por_kg}
                onChange={(v) => updateSelfService('por_kg', v)}
                className="w-24 text-right"
                mono
              />
            </div>
          </Field>

          <Field label="Por quilo · 2 misturas" hint="Por kg">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] text-muted tracking-tight">R$</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.self_service.por_kg_2mix}
                onChange={(v) => updateSelfService('por_kg_2mix', v)}
                className="w-24 text-right"
                mono
              />
            </div>
          </Field>
        </div>

        <p className="mt-3 text-[12px] text-muted tracking-tight">
          Configure a balanca com o mesmo preco por quilo, pra o visor bater
          com a comanda.
        </p>
      </Section>

      <Section
        title="Taxa de servico"
        description="Aplicada automaticamente em pedidos do salao"
      >
        <Field
          label="Percentual"
          hint="Hoje fixo em 10% no PDV. Sera lido desse valor nas proximas iteracoes."
        >
          <div className="flex items-baseline gap-2">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={String(form.service_rate)}
              onChange={(v) => update('service_rate', parseFloat(v) || 0)}
              className="w-24 text-center"
              mono
            />
            <span className="text-[12px] text-muted tracking-tight">%</span>
          </div>
        </Field>
      </Section>

      <Section
        title="Programa de fidelidade"
        description="Pontos acumulados a cada compra — usado em campanhas e cardapio publico"
      >
        <Field
          label="Conversao"
          hint="Hoje fixo em R$ 10 no trigger SQL. Sera lido desse valor nas proximas iteracoes."
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-muted tracking-tight">
              1 ponto a cada R$
            </span>
            <Input
              type="number"
              min="1"
              step="1"
              value={String(form.loyalty_points_per)}
              onChange={(v) => update('loyalty_points_per', parseFloat(v) || 10)}
              className="w-20 text-center"
              mono
            />
          </div>
        </Field>
      </Section>

      <Section
        title="Localizacao e moeda"
        description="Define formatacao de datas, horarios e valores"
      >
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <Field label="Fuso horario">
            <Input
              value={form.timezone}
              onChange={(v) => update('timezone', v)}
              placeholder="America/Sao_Paulo"
              mono
            />
          </Field>
          <Field label="Moeda">
            <Input
              value={form.currency}
              onChange={(v) => update('currency', v)}
              placeholder="BRL"
              mono
            />
          </Field>
        </div>
      </Section>

      <SaveBar
        feedback={feedback}
        errorMsg={errorMsg}
        onSave={handleSave}
        pending={pending}
        label="Salvar operacao"
      />
    </div>
  )
}
