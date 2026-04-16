'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/logo'
import { completeSignupAction, type SignupState } from './actions'

const RESTAURANT_TYPES = [
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'bar', label: 'Bar' },
  { value: 'pizzaria', label: 'Pizzaria' },
  { value: 'lanchonete', label: 'Lanchonete' },
  { value: 'cafeteria', label: 'Cafeteria' },
  { value: 'outro', label: 'Outro' },
]

const STEPS = [
  { num: 1, label: 'Sua conta' },
  { num: 2, label: 'Restaurante' },
  { num: 3, label: 'Criando...' },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3 mb-10">
      {STEPS.map((step, idx) => (
        <div key={step.num} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all ${
                step.num < current
                  ? 'bg-[#4ADE80] text-[#1A1A1A]'
                  : step.num === current
                    ? 'bg-[#1A1A1A] text-[#FAFAFA]'
                    : 'bg-[#262626] text-[#737373]'
              }`}
            >
              {step.num < current ? '✓' : step.num}
            </div>
            <span
              className={`text-[12px] tracking-tight hidden sm:block ${
                step.num === current ? 'text-[#FAFAFA]' : 'text-[#737373]'
              }`}
            >
              {step.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={`w-8 h-px ${step.num < current ? 'bg-[#4ADE80]' : 'bg-[#262626]'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export function SignupForm() {
  const [step, setStep] = useState(1)
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    completeSignupAction,
    null
  )

  // Step 1 fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [step1Error, setStep1Error] = useState('')

  // Step 2 fields
  const [restaurantName, setRestaurantName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [phone, setPhone] = useState('')
  const [restaurantType, setRestaurantType] = useState('')
  const [step2Error, setStep2Error] = useState('')

  function handleStep1Next() {
    setStep1Error('')
    if (!fullName.trim() || fullName.length < 2) {
      setStep1Error('Nome deve ter ao menos 2 caracteres')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setStep1Error('E-mail invalido')
      return
    }
    if (password.length < 6) {
      setStep1Error('Senha deve ter ao menos 6 caracteres')
      return
    }
    if (!terms) {
      setStep1Error('Voce deve aceitar os termos de uso')
      return
    }
    setStep(2)
  }

  function handleStep2Back() {
    setStep2Error('')
    setStep(1)
  }

  function handleStep2Validate(): boolean {
    setStep2Error('')
    if (!restaurantName.trim() || restaurantName.length < 2) {
      setStep2Error('Nome do restaurante deve ter ao menos 2 caracteres')
      return false
    }
    if (!restaurantType) {
      setStep2Error('Selecione o tipo de estabelecimento')
      return false
    }
    return true
  }

  const errorMessage = state && 'error' in state ? state.error : null

  return (
    <div className="min-h-screen bg-[#0B0B0B] flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="text-[14px] font-medium tracking-tight text-[#FAFAFA]">Txoko</span>
        </Link>
        <Link
          href="/login"
          className="text-[13px] text-[#737373] hover:text-[#FAFAFA] transition-colors tracking-tight"
        >
          Ja tenho conta
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <StepIndicator current={step} />

          {step === 1 && (
            <div>
              <h1 className="text-[28px] font-medium tracking-[-0.03em] text-[#FAFAFA] leading-none mb-2">
                Crie sua conta
              </h1>
              <p className="text-[14px] text-[#737373] tracking-tight mb-8">
                14 dias gratis, sem cartao de credito.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    autoComplete="name"
                    className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@restaurante.com"
                    autoComplete="email"
                    className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
                    Senha
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimo 6 caracteres"
                    autoComplete="new-password"
                    className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#4ADE80] rounded shrink-0"
                  />
                  <span className="text-[12px] text-[#737373] tracking-tight leading-relaxed">
                    Concordo com os{' '}
                    <Link href="/termos" className="text-[#FAFAFA] underline hover:text-[#4ADE80] transition-colors">
                      Termos de Uso
                    </Link>{' '}
                    e{' '}
                    <Link href="/privacidade" className="text-[#FAFAFA] underline hover:text-[#4ADE80] transition-colors">
                      Politica de Privacidade
                    </Link>
                  </span>
                </label>

                {step1Error && (
                  <div className="px-3.5 py-2.5 bg-red-950/40 border border-red-800/40 rounded-lg text-[12px] text-red-400 tracking-tight">
                    {step1Error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleStep1Next}
                  className="w-full h-11 bg-[#4ADE80] text-[#1A1A1A] text-[14px] font-semibold rounded-lg hover:bg-[#22C55E] transition-colors"
                >
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="text-[28px] font-medium tracking-[-0.03em] text-[#FAFAFA] leading-none mb-2">
                Seu restaurante
              </h1>
              <p className="text-[14px] text-[#737373] tracking-tight mb-8">
                Informacoes basicas do seu negocio.
              </p>

              <form
                action={(fd) => {
                  if (!handleStep2Validate()) return
                  setStep(3)
                  formAction(fd)
                }}
                className="space-y-4"
              >
                {/* Hidden step 1 fields */}
                <input type="hidden" name="full_name" value={fullName} />
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="password" value={password} />
                <input type="hidden" name="terms" value={terms ? 'on' : ''} />

                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
                    Nome do restaurante
                  </label>
                  <input
                    type="text"
                    name="restaurant_name"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="Ex: Restaurante do Ze"
                    autoComplete="organization"
                    className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
                    Tipo de estabelecimento
                  </label>
                  <select
                    name="restaurant_type"
                    value={restaurantType}
                    onChange={(e) => setRestaurantType(e.target.value)}
                    className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#4ADE80] transition-colors appearance-none"
                  >
                    <option value="" disabled>Selecione...</option>
                    {RESTAURANT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
                    CNPJ{' '}
                    <span className="text-[#525252] normal-case font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    name="cnpj"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[#737373] mb-2">
                    Telefone{' '}
                    <span className="text-[#525252] normal-case font-normal">(opcional)</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 9 0000-0000"
                    className="w-full h-11 px-3.5 bg-[#141414] border border-[#262626] rounded-lg text-[13px] text-[#FAFAFA] placeholder:text-[#525252] focus:outline-none focus:border-[#4ADE80] transition-colors"
                  />
                </div>

                {(step2Error || errorMessage) && (
                  <div className="px-3.5 py-2.5 bg-red-950/40 border border-red-800/40 rounded-lg text-[12px] text-red-400 tracking-tight">
                    {step2Error || errorMessage}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleStep2Back}
                    className="h-11 px-5 border border-[#262626] text-[#737373] text-[13px] font-medium rounded-lg hover:border-[#363636] hover:text-[#FAFAFA] transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="flex-1 h-11 bg-[#4ADE80] text-[#1A1A1A] text-[14px] font-semibold rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
                  >
                    {pending ? 'Criando conta...' : 'Criar conta gratis'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[#4ADE80]/10 border border-[#4ADE80]/20 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-[#4ADE80] border-t-transparent animate-spin" />
              </div>
              <h2 className="text-[22px] font-medium text-[#FAFAFA] tracking-tight mb-2">
                Configurando seu restaurante
              </h2>
              <p className="text-[14px] text-[#737373] tracking-tight">
                Isso leva apenas alguns segundos...
              </p>
              {errorMessage && (
                <div className="mt-6 px-4 py-3 bg-red-950/40 border border-red-800/40 rounded-lg text-[13px] text-red-400 tracking-tight">
                  {errorMessage}
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="block mt-2 text-[#FAFAFA] underline text-[12px]"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="px-8 py-6 text-center">
        <p className="text-[11px] text-[#525252] tracking-tight">
          © 2026 Txoko · Gestao para restaurantes
        </p>
      </footer>
    </div>
  )
}
