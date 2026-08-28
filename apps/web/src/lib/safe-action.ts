'use client'

/**
 * Server action que LANCA — em vez de retornar { error } — derruba a tela
 * inteira no error boundary ("Algo deu errado" e o operador perde a comanda
 * da frente). Acontece fora do codigo da action: deploy novo invalida o id
 * da action da aba aberta, sessao expirada faz o middleware responder com o
 * redirect do login, rede cai no meio do POST.
 *
 * Este wrapper converte o throw no mesmo `{ error }` que as actions ja
 * retornam, entao a tela mostra o aviso e segue de pe. Quando o motivo e
 * versao velha da aba ou resposta que nao e de action (login), a unica
 * saida real e recarregar — agenda o reload e avisa antes.
 */
export async function safeAction<T>(promise: Promise<T>): Promise<T | { error: string }> {
  try {
    return await promise
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const precisaRecarregar =
      /server action|deployment|unexpected response/i.test(msg)
    if (precisaRecarregar && typeof window !== 'undefined') {
      setTimeout(() => window.location.reload(), 2500)
      return { error: 'O sistema foi atualizado — recarregando a tela…' }
    }
    return { error: 'Sem resposta do servidor. Confira a internet e recarregue a pagina (F5).' }
  }
}
