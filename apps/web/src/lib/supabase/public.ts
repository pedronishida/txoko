import { createClient } from '@supabase/supabase-js'

// Cliente sem cookies — para uso em generateStaticParams,
// build-time e qualquer contexto fora de request (anon-only).
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  )
}
