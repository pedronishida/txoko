// =============================================================
// iFood Token Manager
// Obtem e renova tokens para uma integracao salva no banco.
// Usa service_role — chamar APENAS de server routes.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { IfoodClient } from './client'
import type { IfoodIntegration } from './types'

const TOKEN_BUFFER_SECONDS = 120 // renova 2 min antes do vencimento

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return true
  const exp = new Date(expiresAt).getTime()
  return Date.now() >= exp - TOKEN_BUFFER_SECONDS * 1000
}

/**
 * Retorna um access_token valido para a integracao.
 * Se expirado/ausente, autentica novamente e persiste no banco.
 */
export async function getValidToken(
  supabase: SupabaseClient,
  integration: IfoodIntegration
): Promise<{ token: string } | { error: string }> {
  // Retorna token em cache se ainda valido
  if (integration.access_token && !isExpiringSoon(integration.token_expires_at)) {
    return { token: integration.access_token }
  }

  // Precisa de credenciais para autenticar
  if (!integration.client_id || !integration.client_secret) {
    return { error: 'Credenciais iFood nao configuradas (client_id / client_secret)' }
  }

  try {
    const client = new IfoodClient(integration.client_id, integration.client_secret)
    const tokenRes = await client.authenticate()

    const expiresAt = new Date(
      Date.now() + tokenRes.expires_in * 1000
    ).toISOString()

    const { error } = await supabase
      .from('ifood_integrations')
      .update({
        access_token: tokenRes.access_token,
        token_expires_at: expiresAt,
      })
      .eq('id', integration.id)

    if (error) {
      return { error: `Falha ao salvar token: ${error.message}` }
    }

    return { token: tokenRes.access_token }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
