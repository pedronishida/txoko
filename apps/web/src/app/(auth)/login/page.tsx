'use client'

import { useActionState, useState } from 'react'
import { loginAction, signupAction, type AuthState } from '../actions'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === 'login' ? loginAction : signupAction,
    null
  )

  return (
    <div>
      <header className="mb-10">
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-cloud leading-none">
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </h1>
        <p className="text-[13px] text-stone mt-3 tracking-tight">
          {mode === 'login'
            ? 'Acesse seu painel com e-mail e senha'
            : 'Crie sua conta e comece a gerenciar o restaurante'}
        </p>
      </header>

      <form action={action} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="block text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-2"
          >
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="voce@restaurante.com"
            className="w-full h-11 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-2"
          >
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Minimo 6 caracteres"
            className="w-full h-11 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark transition-colors"
          />
        </div>

        {state?.error && (
          <div className="px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full h-11 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors disabled:opacity-40"
        >
          {pending
            ? mode === 'login'
              ? 'Entrando'
              : 'Criando'
            : mode === 'login'
              ? 'Entrar'
              : 'Criar conta'}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-night-lighter text-center">
        <p className="text-[12px] text-stone tracking-tight">
          {mode === 'login' ? 'Nao tem conta?' : 'Ja tem conta?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-cloud hover:text-cloud-dark transition-colors"
          >
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </div>
    </div>
  )
}
