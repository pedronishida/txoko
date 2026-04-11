'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Mock login — sera substituido por Supabase Auth
    if (email && password) {
      await new Promise((r) => setTimeout(r, 500))
      router.push('/dashboard')
    } else {
      setError('Preencha todos os campos')
    }
    setLoading(false)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-cloud">
          txoko
        </h1>
        <p className="text-stone-light mt-2 text-sm">
          Gestao inteligente para restaurantes
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-stone-light mb-1.5">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="w-full px-3 py-2.5 bg-night-light border border-night-lighter rounded-lg text-cloud placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-leaf/50 focus:border-leaf transition-colors"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-stone-light mb-1.5">
            Senha
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 bg-night-light border border-night-lighter rounded-lg text-cloud placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-leaf/50 focus:border-leaf transition-colors"
          />
        </div>

        {error && (
          <p className="text-coral text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-leaf text-night font-semibold rounded-lg hover:bg-leaf-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="text-center text-sm text-stone">
          Esqueceu a senha?{' '}
          <button type="button" className="text-leaf hover:underline">
            Recuperar
          </button>
        </p>
      </form>
    </div>
  )
}
