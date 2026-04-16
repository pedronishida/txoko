'use client'

import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/logo'
import {
  saveRestaurantDetailsAction,
  saveProductsAction,
  inviteStaffAction,
  completeOnboardingAction,
  type OnboardingState,
} from './actions'

const STEPS = [
  { num: 1, label: 'Restaurante' },
  { num: 2, label: 'Cardapio' },
  { num: 3, label: 'Equipe' },
  { num: 4, label: 'Pronto!' },
]

const STAFF_ROLES = [
  { value: 'garcom', label: 'Garcom' },
  { value: 'cozinha', label: 'Cozinha' },
  { value: 'caixa', label: 'Caixa' },
  { value: 'gerente', label: 'Gerente' },
]

type Product = { name: string; price: string }
type StaffInvite = { email: string; role: string }

function WizardProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3 mb-12">
      {STEPS.map((step, idx) => (
        <div key={step.num} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all ${
                step.num < current
                  ? 'bg-[#4ADE80] text-[#1A1A1A]'
                  : step.num === current
                    ? 'bg-[#1A1A1A] text-[#FAFAFA] ring-2 ring-[#4ADE80] ring-offset-2 ring-offset-[#0B0B0B]'
                    : 'bg-[#1A1A1A] text-[#525252] border border-[#262626]'
              }`}
            >
              {step.num < current ? '✓' : step.num}
            </div>
            <span
              className={`text-[12px] tracking-tight hidden sm:block ${
                step.num === current ? 'text-[#FAFAFA]' : 'text-[#525252]'
              }`}
            >
              {step.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={`w-8 sm:w-12 h-px ${step.num < current ? 'bg-[#4ADE80]' : 'bg-[#262626]'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────
// Step 1 — Restaurant details
// ─────────────────────────────────────────────────

function Step1Details({ onNext }: { onNext: () => void }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    saveRestaurantDetailsAction,
    null
  )

  async function handleSubmit(fd: FormData) {
    const result = await saveRestaurantDetailsAction(null, fd)
    if (!result) onNext()
  }

  return (
    <div>
      <h2 className="text-[26px] font-medium tracking-[-0.03em] text-[#FAFAFA] leading-none mb-2">
        Dados do restaurante
      </h2>
      <p className="text-[14px] text-[#737373] tracking-tight mb-8">
        Preencha as informacoes basicas. Voce pode editar depois.
      </p>

      <form action={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
            Endereco
            <span className="text-[#525252] normal-case font-normal ml-1">(opcional)</span>
          </label>
          <input
            type="text"
            name="address"
            placeholder="Rua, numero, bairro, cidade"
            className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
              Abertura
            </label>
            <input
              type="time"
              name="opening_time"
              defaultValue="11:00"
              className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#4ADE80] transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
              Fechamento
            </label>
            <input
              type="time"
              name="closing_time"
              defaultValue="23:00"
              className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#4ADE80] transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
            Taxa de servico (%)
            <span className="text-[#525252] normal-case font-normal ml-1">(opcional)</span>
          </label>
          <input
            type="number"
            name="service_charge"
            min="0"
            max="100"
            step="0.5"
            placeholder="Ex: 10"
            className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
          />
        </div>

        {state && 'error' in state && (
          <div className="px-3.5 py-2.5 bg-red-950/40 border border-red-800/40 rounded-lg text-[12px] text-red-400 tracking-tight">
            {state.error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 h-11 bg-[#4ADE80] text-[#1A1A1A] text-[14px] font-semibold rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
          >
            {pending ? 'Salvando...' : 'Continuar →'}
          </button>
          <button
            type="button"
            onClick={onNext}
            className="h-11 px-5 border border-[#262626] text-[#737373] text-[13px] rounded-lg hover:border-[#363636] hover:text-[#FAFAFA] transition-colors"
          >
            Pular
          </button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────
// Step 2 — First products
// ─────────────────────────────────────────────────

function Step2Products({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([
    { name: '', price: '' },
    { name: '', price: '' },
    { name: '', price: '' },
  ])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function updateProduct(idx: number, field: keyof Product, value: string) {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))
  }

  function addProduct() {
    setProducts((prev) => [...prev, { name: '', price: '' }])
  }

  function removeProduct(idx: number) {
    setProducts((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleSave() {
    const fd = new FormData()
    const filled = products.filter((p) => p.name.trim() && p.price)
    if (filled.length > 0) {
      filled.forEach((p) => {
        fd.append('product_name', p.name.trim())
        fd.append('product_price', p.price)
      })
    }
    startTransition(async () => {
      const result = await saveProductsAction(null, fd)
      if (result && 'error' in result) {
        setError(result.error)
      } else {
        onNext()
      }
    })
  }

  return (
    <div>
      <h2 className="text-[26px] font-medium tracking-[-0.03em] text-[#FAFAFA] leading-none mb-2">
        Primeiros produtos
      </h2>
      <p className="text-[14px] text-[#737373] tracking-tight mb-8">
        Adicione alguns produtos do seu cardapio para comecar.
      </p>

      <div className="space-y-3 mb-4">
        {products.map((p, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <input
              type="text"
              value={p.name}
              onChange={(e) => updateProduct(idx, 'name', e.target.value)}
              placeholder={`Produto ${idx + 1}`}
              className="flex-1 h-10 px-3 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
            />
            <div className="relative w-28">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#525252]">R$</span>
              <input
                type="number"
                value={p.price}
                onChange={(e) => updateProduct(idx, 'price', e.target.value)}
                placeholder="0,00"
                min="0"
                step="0.01"
                className="w-full h-10 pl-8 pr-3 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
              />
            </div>
            {products.length > 1 && (
              <button
                type="button"
                onClick={() => removeProduct(idx)}
                className="w-8 h-8 flex items-center justify-center text-[#525252] hover:text-[#EF4444] transition-colors"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addProduct}
        className="text-[12px] text-[#4ADE80] hover:text-[#22C55E] transition-colors tracking-tight mb-6 block"
      >
        + Adicionar produto
      </button>

      {error && (
        <div className="mb-4 px-3.5 py-2.5 bg-red-950/40 border border-red-800/40 rounded-lg text-[12px] text-red-400 tracking-tight">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-11 px-5 border border-[#262626] text-[#737373] text-[13px] rounded-lg hover:border-[#363636] hover:text-[#FAFAFA] transition-colors"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="flex-1 h-11 bg-[#4ADE80] text-[#1A1A1A] text-[14px] font-semibold rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
        >
          {isPending ? 'Salvando...' : 'Continuar →'}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="h-11 px-5 border border-[#262626] text-[#737373] text-[13px] rounded-lg hover:border-[#363636] hover:text-[#FAFAFA] transition-colors"
        >
          Pular
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// Step 3 — Invite staff
// ─────────────────────────────────────────────────

function Step3Staff({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [invites, setInvites] = useState<StaffInvite[]>([
    { email: '', role: 'garcom' },
    { email: '', role: 'garcom' },
    { email: '', role: 'garcom' },
  ])
  const [isPending, startTransition] = useTransition()

  function updateInvite(idx: number, field: keyof StaffInvite, value: string) {
    setInvites((prev) => prev.map((inv, i) => (i === idx ? { ...inv, [field]: value } : inv)))
  }

  function handleSave() {
    const fd = new FormData()
    const filled = invites.filter((inv) => inv.email.trim())
    filled.forEach((inv) => {
      fd.append('invite_email', inv.email.trim())
      fd.append('invite_role', inv.role)
    })

    startTransition(async () => {
      await inviteStaffAction(null, fd)
      onNext()
    })
  }

  return (
    <div>
      <h2 className="text-[26px] font-medium tracking-[-0.03em] text-[#FAFAFA] leading-none mb-2">
        Convide sua equipe
      </h2>
      <p className="text-[14px] text-[#737373] tracking-tight mb-8">
        Adicione colaboradores por e-mail. Eles receberao um convite.
      </p>

      <div className="space-y-3 mb-6">
        {invites.map((inv, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <input
              type="email"
              value={inv.email}
              onChange={(e) => updateInvite(idx, 'email', e.target.value)}
              placeholder={`colaborador${idx + 1}@email.com`}
              className="flex-1 h-10 px-3 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
            />
            <select
              value={inv.role}
              onChange={(e) => updateInvite(idx, 'role', e.target.value)}
              className="w-32 h-10 px-3 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#4ADE80] transition-colors appearance-none"
            >
              {STAFF_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-11 px-5 border border-[#262626] text-[#737373] text-[13px] rounded-lg hover:border-[#363636] hover:text-[#FAFAFA] transition-colors"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="flex-1 h-11 bg-[#4ADE80] text-[#1A1A1A] text-[14px] font-semibold rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
        >
          {isPending ? 'Enviando convites...' : 'Continuar →'}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="h-11 px-5 border border-[#262626] text-[#737373] text-[13px] rounded-lg hover:border-[#363636] hover:text-[#FAFAFA] transition-colors"
        >
          Pular
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// Step 4 — Done
// ─────────────────────────────────────────────────

function Step4Done({ onBack }: { onBack: () => void }) {
  const [isPending, startTransition] = useTransition()

  function handleGo() {
    startTransition(async () => {
      await completeOnboardingAction()
    })
  }

  return (
    <div className="text-center py-8">
      {/* Success icon */}
      <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-[#4ADE80]/10 border border-[#4ADE80]/20 flex items-center justify-center">
        <span className="text-4xl">🎉</span>
      </div>

      <h2 className="text-[32px] font-medium tracking-[-0.03em] text-[#FAFAFA] leading-none mb-3">
        Tudo pronto!
      </h2>
      <p className="text-[15px] text-[#737373] tracking-tight max-w-sm mx-auto leading-relaxed mb-8">
        Seu restaurante esta configurado. Vamos ao dashboard para comecar a vender.
      </p>

      {/* Preview stats */}
      <div className="grid grid-cols-3 gap-4 mb-10 text-left">
        {[
          { icon: '📋', label: 'PDV pronto para uso' },
          { icon: '🍽️', label: 'Cardapio online ativo' },
          { icon: '🤖', label: 'IA configurada' },
        ].map((item) => (
          <div key={item.label} className="bg-[#141414] rounded-xl p-4 border border-[#262626]">
            <span className="text-2xl block mb-2">{item.icon}</span>
            <p className="text-[12px] text-[#D4D4D4] tracking-tight leading-snug">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          type="button"
          onClick={handleGo}
          disabled={isPending}
          className="h-12 px-10 bg-[#4ADE80] text-[#1A1A1A] text-[15px] font-semibold rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
        >
          {isPending ? 'Carregando dashboard...' : 'Ir para o dashboard →'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 border border-[#262626] text-[#737373] text-[13px] rounded-lg hover:border-[#363636] hover:text-[#FAFAFA] transition-colors"
        >
          Voltar
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// Main wizard component
// ─────────────────────────────────────────────────

export function OnboardingWizard() {
  const [step, setStep] = useState(1)

  return (
    <div className="min-h-screen bg-[#0B0B0B] flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 flex items-center justify-between border-b border-[#141414]">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="text-[14px] font-medium tracking-tight text-[#FAFAFA]">Txoko</span>
        </Link>
        <Link
          href="/home"
          className="text-[12px] text-[#525252] hover:text-[#FAFAFA] transition-colors tracking-tight"
        >
          Configurar depois →
        </Link>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-12">
        <div className="w-full max-w-[520px]">
          <WizardProgress current={step} />

          {step === 1 && (
            <Step1Details onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <Step2Products onNext={() => setStep(3)} onBack={() => setStep(1)} />
          )}
          {step === 3 && (
            <Step3Staff onNext={() => setStep(4)} onBack={() => setStep(2)} />
          )}
          {step === 4 && (
            <Step4Done onBack={() => setStep(3)} />
          )}
        </div>
      </main>
    </div>
  )
}
