// Classifica o que foi bipado: cartao de comanda, etiqueta de peso da balanca
// ou codigo de barras de produto.
//
// O cartao e identificado por CODIGO DE BARRAS, nao mais por QR: leitor 1D
// barato le mais rapido e muitos leem so 1D. O QR do cartao passou a ser
// exclusivo do cliente (link em /q/<slug>) e nao abre comanda nenhuma.
//
// Formato de peso EAN-13 (Toledo Prix padrao BR): 2PPPPPWWWWWC
//   2      = prefixo (1 digito)
//   PPPPP  = codigo do produto cadastrado na balanca (5 digitos) - ignorado
//   WWWWW  = peso em gramas (5 digitos, 00001 a 99999)
//   C      = check digit
//
// Se o restaurante configurar a balanca com formato diferente, ajustar as
// posicoes abaixo.

export type ScanResult =
  | { kind: 'card_barcode'; barcode: string }
  | { kind: 'weight'; weightGrams: number; raw: string }
  | { kind: 'barcode'; code: string }
  | { kind: 'unknown'; raw: string }

// 'C' + 12 hex. Comeca com letra, entao nunca colide com etiqueta de peso
// nem com EAN de produto.
const CARD_BARCODE_RE = /^C[0-9A-F]{12}$/i
const WEIGHT_EAN_RE = /^2\d{12}$/
const GENERIC_BARCODE_RE = /^\d{8,14}$/

export function parseScan(raw: string): ScanResult {
  const s = raw.trim()

  if (!s) return { kind: 'unknown', raw: s }

  if (CARD_BARCODE_RE.test(s)) {
    return { kind: 'card_barcode', barcode: s.toUpperCase() }
  }

  if (WEIGHT_EAN_RE.test(s)) {
    // Posicoes 7..12 (0-indexed) contem o peso em gramas
    const weightGrams = parseInt(s.slice(7, 12), 10)
    if (weightGrams > 0) {
      return { kind: 'weight', weightGrams, raw: s }
    }
  }

  if (GENERIC_BARCODE_RE.test(s)) {
    return { kind: 'barcode', code: s }
  }

  return { kind: 'unknown', raw: s }
}
