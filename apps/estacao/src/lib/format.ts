/**
 * Formatacao da estacao.
 *
 * O peso aparece em tres formas diferentes e elas nao sao intercambiaveis:
 *   - no visor, alinhado com o da balanca: "4,850 kg" (tres casas sempre)
 *   - em prosa, dentro de uma frase: "4,85 kg" (sem zero a direita)
 *   - abaixo de um quilo: "485 g"
 * Trocar uma pela outra faz o operador conferir o visor da balanca contra um
 * numero escrito diferente do que ele esta lendo.
 */

/**
 * Espaco estreito inquebravel entre simbolo e valor (U+202F).
 *
 * Mesmo criterio do painel: em mono, um espaco comum vale um avanco inteiro e
 * afasta demais; U+2009 aproxima mas quebra linha, deixando o "R$" sozinho
 * acima do numero.
 */
const NNBSP = ' '

/**
 * Formata um valor que o servidor ja arredondou. A estacao nunca multiplica
 * peso por taxa: quem faz essa conta e station_add_weight_item, em numeric,
 * com round(..., 2).
 *
 * Isso importa num caso concreto. 4,85 kg a R$ 89,90/kg da exatamente
 * 436,015, que o Postgres arredonda para 436,02. O prototipo do desenho
 * usava toFixed(2) em ponto flutuante e mostrava 436,01 — 436.015 nao e
 * representavel em binario e vira 436.0149999..., entao o toFixed corta pra
 * baixo. Reproduzir isso aqui faria a tela discordar do total do pedido.
 */
export function formatCurrency(n: number): string {
  return (
    'R$' +
    NNBSP +
    n.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

/** Peso como o visor mostra: gramas ate 1 kg, depois quilo com tres casas. */
export function formatWeight(grams: number | null): string {
  if (grams == null) return ''
  if (grams < 1000) return `${grams} g`
  return `${(grams / 1000).toFixed(3).replace('.', ',')} kg`
}

/** Peso dentro de uma frase: perde os zeros a direita. "4,85 kg", nao "4,850 kg". */
export function formatWeightProse(grams: number): string {
  const kg = Number((grams / 1000).toFixed(3))
  return `${String(kg).replace('.', ',')} kg`
}

export function formatPricePerKg(n: number): string {
  return `${formatCurrency(n)}/kg`
}

export function serviceModeLabel(mode: string | null): string {
  if (mode === 'avontade') return 'A vontade'
  if (mode === 'por_kg') return 'Por quilo'
  if (mode === 'por_kg_2mix') return 'Por quilo · 2 misturas'
  return 'Sem modalidade'
}

/**
 * Le o peso do jeito que a atendente digita, olhando pro visor da balanca:
 *   "485" / "485g" / "485 G"  -> 485 g
 *   "0,485" / "0.485" / "1,5" -> quilos, vira 485 g / 1500 g
 * Devolve null quando nao e peso (ai o texto segue pro leitor de barras).
 */
export function parseManualWeight(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')

  const grams = s.match(/^(\d{1,4})g?$/)
  if (grams) return Number(grams[1])

  const kilos = s.match(/^(\d{1,2})[.,](\d{1,3})(?:kg)?$/)
  if (kilos) {
    const decimals = kilos[2]!.padEnd(3, '0')
    return Number(kilos[1]) * 1000 + Number(decimals)
  }

  return null
}
