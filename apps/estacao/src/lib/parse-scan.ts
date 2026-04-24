// Classifica o que foi escaneado: QR token (cartao), etiqueta de peso ou codigo de barras unitario.
//
// Pro MVP usamos heuristica de prefixo:
// - 32 hex chars           -> QR token do cartao (gerado por crypto.randomBytes(16))
// - 13 digitos comecando 2 -> etiqueta de peso Toledo (convencao BR: "2" sinaliza item de peso)
// - 13 ou 8+ digitos outro -> barcode EAN-13 / EAN-8 / UPC de item unitario
//
// Formato EAN-13 de peso (Toledo Prix padrao BR): 2PPPPPWWWWWC
//   2      = prefixo (1 digito)
//   PPPPP  = codigo do produto cadastrado na balanca (5 digitos) - ignorado pro MVP
//            (o produto "Self-Service por Kg" eh resolvido por restaurante no DB)
//   WWWWW  = peso em gramas (5 digitos, 00001 a 99999)
//   C      = check digit (1 digito)
//
// Se o restaurante configurar a balanca com formato diferente, ajustar as posicoes abaixo.

export type ScanResult =
  | { kind: 'qr_token'; token: string }
  | { kind: 'weight'; weightGrams: number; raw: string }
  | { kind: 'barcode'; code: string }
  | { kind: 'unknown'; raw: string }

const QR_TOKEN_RE = /^[0-9a-f]{32}$/i
const WEIGHT_EAN_RE = /^2\d{12}$/
const GENERIC_BARCODE_RE = /^\d{8,14}$/

export function parseScan(raw: string): ScanResult {
  const s = raw.trim()

  if (!s) return { kind: 'unknown', raw: s }

  if (QR_TOKEN_RE.test(s)) {
    return { kind: 'qr_token', token: s.toLowerCase() }
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
