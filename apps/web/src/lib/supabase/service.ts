import { createClient } from '@supabase/supabase-js'

// Cliente com SERVICE_ROLE — usar APENAS em routes server-side que
// recebem requisicoes nao autenticadas (ex: webhooks de terceiros).
// NUNCA importar em client components ou expor ao browser.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL nao configurado')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY nao configurado')
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
