'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Tara: o peso do prato vazio, que a balanca ve e o cliente nao come.
 *
 * A balanca pesa louca e comida juntas. Sem descontar o prato, todo cliente
 * pagaria por 766 g que ficam no balcao — a R$ 82,90/kg, sao R$ 63,50 a mais
 * em cada comanda. Nao e arredondamento: e a maior fonte de erro possivel
 * nesta tela.
 *
 * Fica no aparelho, como o tema, e nao no banco: o prato e do restaurante,
 * mas quem precisa acertar isso e quem esta no balcao com uma balanca e uma
 * pilha de pratos na mao, e ele nao deveria depender de rede nem de uma tela
 * de configuracao noutro lugar. Se um dia houver duas estacoes com loucas
 * diferentes, cada uma guarda a sua — o que e mais certo, nao menos.
 */

const CHAVE = 'txoko-tara-g'

/** O prato de louca em uso hoje. Trocar a louca muda este numero. */
export const TARA_PADRAO = 766

/** Acima disso nao e prato, e engano de digitacao. */
const TARA_MAXIMA = 3000

export function useTara(): { tara: number; definirTara: (g: number) => void } {
  // Comeca no padrao nos dois lados: ler localStorage na renderizacao daria
  // um HTML no servidor e outro no cliente.
  const [tara, setTara] = useState(TARA_PADRAO)

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CHAVE)
      if (guardado == null) return
      const n = Number(guardado)
      if (Number.isFinite(n) && n >= 0 && n <= TARA_MAXIMA) setTara(n)
    } catch {
      // navegador sem storage: segue no padrao
    }
  }, [])

  const definirTara = useCallback((g: number) => {
    if (!Number.isFinite(g) || g < 0 || g > TARA_MAXIMA) return
    setTara(g)
    try {
      localStorage.setItem(CHAVE, String(g))
    } catch {
      // sem storage o valor vale ate a proxima recarga, que ja e melhor que nada
    }
  }, [])

  return { tara, definirTara }
}
