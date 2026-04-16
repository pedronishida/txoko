import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignupForm } from './signup-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Criar conta — Txoko',
  description: 'Crie sua conta e comece a gerenciar seu restaurante gratis por 14 dias.',
}

export default async function SignupPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/home')

  return <SignupForm />
}
