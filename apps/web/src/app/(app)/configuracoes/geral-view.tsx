'use client'

import { useState, useTransition } from 'react'
import { updateRestaurant } from './actions'
import { Field, Input, SaveBar, Section } from './settings-ui'

export type RestaurantFormData = {
  id: string
  name: string
  legal_name: string
  cnpj: string
  phone: string
  email: string
  address_full: string
}

export function GeralView({ initial }: { initial: RestaurantFormData }) {
  const [form, setForm] = useState<RestaurantFormData>(initial)
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function update<K extends keyof RestaurantFormData>(
    key: K,
    value: RestaurantFormData[K]
  ) {
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

  return (
    <div className="max-w-3xl">
      <Section
        title="Dados do restaurante"
        description="Nome fantasia, razao social e contato exibidos em notas fiscais e cardapio publico"
      >
        <div className="space-y-4">
          <Field label="Nome fantasia">
            <Input value={form.name} onChange={(v) => update('name', v)} />
          </Field>
          <Field label="Razao social">
            <Input
              value={form.legal_name}
              onChange={(v) => update('legal_name', v)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="CNPJ">
              <Input
                value={form.cnpj}
                onChange={(v) => update('cnpj', v)}
                placeholder="00.000.000/0000-00"
                mono
              />
            </Field>
            <Field label="Telefone">
              <Input
                value={form.phone}
                onChange={(v) => update('phone', v)}
                placeholder="(11) 99999-9999"
              />
            </Field>
          </div>
          <Field label="E-mail">
            <Input
              value={form.email}
              onChange={(v) => update('email', v)}
              placeholder="contato@exemplo.com"
            />
          </Field>
          <Field label="Endereco">
            <Input
              value={form.address_full}
              onChange={(v) => update('address_full', v)}
              placeholder="Rua, numero, bairro, cidade"
            />
          </Field>
        </div>
      </Section>

      <SaveBar
        feedback={feedback}
        errorMsg={errorMsg}
        onSave={handleSave}
        pending={pending}
        label="Salvar dados"
      />
    </div>
  )
}
