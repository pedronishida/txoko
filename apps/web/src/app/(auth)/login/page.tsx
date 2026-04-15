'use client'

import { useActionState, useState } from 'react'
import { Mail, Lock } from 'lucide-react'
import { Logo } from '@/components/logo'
import { loginAction, signupAction, type AuthState } from '../actions'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === 'login' ? loginAction : signupAction,
    null
  )

  return (
    <div className="space-y-8">
      <div className="lg:hidden mb-8">
        <Logo size={36} showWordmark />
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === 'login'
            ? 'Acesse seu painel com email e senha'
            : 'Crie sua conta e comece a gerenciar seu restaurante'}
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-xs font-medium text-foreground"
          >
            E-mail
          </label>
          <div className="relative">
            <Mail
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="seu@email.com"
              className="w-full pl-10 pr-3 py-3 bg-surface border border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs font-medium text-foreground"
          >
            Senha
          </label>
          <div className="relative">
            <Lock
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full pl-10 pr-3 py-3 bg-surface border border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
        </div>

        {state?.error && (
          <div className="px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-hover shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending
            ? mode === 'login'
              ? 'Entrando...'
              : 'Criando...'
            : mode === 'login'
            ? 'Entrar'
            : 'Criar conta'}
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-bg px-3 text-muted-foreground">ou</span>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {mode === 'login' ? 'Nao tem conta?' : 'Ja tem conta?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-primary font-semibold hover:underline"
          >
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </form>
    </div>
  )
}
