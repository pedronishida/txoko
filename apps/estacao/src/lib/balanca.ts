'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Leitura ao vivo da balanca, pela porta serial.
 *
 * O aparelho e uma Urano US 31/2 POP-S ligada por cabo RJ45 -> USB. Ela nao
 * fala sozinha: responde a um ENQ (0x05) com um bloco de texto de ~150 bytes
 * no formato do cupom, e o peso liquido esta la dentro:
 *
 *   DATA: 00/00/00  VALID.: 00/00/00  TARA: 0.000kg  PESO L: 0.994kg ...
 *
 * Entao a leitura "continua" e na verdade uma pergunta repetida — o intervalo
 * abaixo e o que faz o numero na tela acompanhar a mao de quem serve.
 *
 * Vale so em Chrome ou Edge de computador: Web Serial nao existe em Android
 * nem no iPad, e a estacao roda em Chrome de quiosque.
 */

const BAUD = 9600
const ENQ = 0x05

// Pergunta o peso ~3x por segundo. Mais rapido que isso a balanca comeca a
// atropelar as proprias respostas e o buffer chega picotado.
const INTERVALO_MS = 350

// Sem resposta por esse tempo, a balanca conta como muda — cabo solto,
// aparelho desligado, alguem trocou a porta USB.
const SILENCIO_MS = 2500

/**
 * Leituras iguais seguidas para o peso valer como parado.
 *
 * Existe porque o prato oscila enquanto a pessoa serve e enquanto a mao ainda
 * apoia. Lancar no meio disso cobra o peso errado — foi exatamente o que
 * apareceu no teste de bancada: 0,540 kg no caminho ate os 0,994 kg reais.
 */
const AMOSTRAS_PARA_ESTAVEL = 3

export type EstadoBalanca =
  /** Navegador sem Web Serial (Android, iPad, Firefox). */
  | 'sem-suporte'
  /** Ninguem conectou ainda, ou desconectou. */
  | 'desligada'
  | 'conectando'
  /** Conectada e respondendo. */
  | 'lendo'
  /** Porta aberta, mas a balanca parou de responder. */
  | 'muda'
  | 'erro'

export type Balanca = {
  estado: EstadoBalanca
  /** Peso liquido em gramas; null enquanto nao houve leitura valida. */
  gramas: number | null
  /** Peso parado ha AMOSTRAS_PARA_ESTAVEL leituras — pode lancar. */
  estavel: boolean
  erro: string | null
  /** Abre o seletor de porta do navegador. Precisa de gesto do usuario. */
  conectar: () => Promise<void>
  desconectar: () => Promise<void>
}

/**
 * Acha o peso liquido no bloco que a balanca devolve.
 *
 * Fica em gramas inteiras de proposito: "0.994" vira 994 por concatenacao, e
 * nao por 0.994 * 1000, que em ponto flutuante daria 993.9999999999999. O
 * resto do sistema conta gramas inteiras — o servidor precifica a partir
 * delas.
 *
 * O buffer pode conter varias respostas empilhadas; vale a ultima, que e a
 * mais recente.
 */
export function extrairGramas(texto: string): number | null {
  const achados = [...texto.matchAll(/PESO L:\s*(\d{1,3})[.,](\d{1,3})\s*kg/gi)]
  const ultimo = achados[achados.length - 1]
  if (!ultimo) return null
  const kg = Number(ultimo[1])
  const milesimos = (ultimo[2] ?? '').padEnd(3, '0')
  const gramas = kg * 1000 + Number(milesimos)
  return Number.isFinite(gramas) ? gramas : null
}

/** Bytes -> texto, com os controles virando espaco pra nao quebrar o regex. */
function paraTexto(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) {
    s += b >= 32 && b <= 126 ? String.fromCharCode(b) : ' '
  }
  return s
}

export function useBalanca(): Balanca {
  const [estado, setEstado] = useState<EstadoBalanca>('desligada')
  const [gramas, setGramas] = useState<number | null>(null)
  const [estavel, setEstavel] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const portaRef = useRef<SerialPort | null>(null)
  const leitorRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const escritorRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const pararRef = useRef(false)
  const bufferRef = useRef('')
  const ultimaRespostaRef = useRef(0)
  // Peso repetido e quantas vezes: e o que decide o "parado".
  const repeticaoRef = useRef<{ gramas: number; vezes: number } | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      setEstado('sem-suporte')
    }
  }, [])

  const desconectar = useCallback(async () => {
    pararRef.current = true
    try {
      await leitorRef.current?.cancel()
    } catch {
      // o leitor ja pode ter caido junto com a porta
    }
    try {
      escritorRef.current?.releaseLock()
    } catch {
      // idem
    }
    try {
      await portaRef.current?.close()
    } catch {
      // idem
    }
    leitorRef.current = null
    escritorRef.current = null
    portaRef.current = null
    bufferRef.current = ''
    repeticaoRef.current = null
    setEstado('desligada')
    setGramas(null)
    setEstavel(false)
  }, [])

  /**
   * Abre a porta e comeca a perguntar o peso.
   *
   * A porta chega pronta de dois lugares: do seletor do navegador (primeira
   * vez) ou de getPorts(), que devolve o que ja foi autorizado antes — e o
   * que faz o quiosque voltar lendo depois de recarregar, sem ninguem
   * autorizar de novo.
   */
  const abrir = useCallback(
    async (porta: SerialPort) => {
      // Mesma porta com os lacos vivos: nao ha o que refazer. A guarda existe
      // porque o StrictMode monta duas vezes em dev — sem ela o segundo open()
      // falha e, pior, o segundo getWriter() trava o stream de escrita e a
      // balanca fica muda sem dizer por que.
      if (portaRef.current === porta && !pararRef.current) return

      setEstado('conectando')
      setErro(null)
      try {
        await porta.open({
          baudRate: BAUD,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha ao abrir a porta'
        // Ja aberta e o caso da remontagem: segue e so reata os lacos.
        if (!/already open/i.test(msg)) {
          setErro(msg)
          setEstado('erro')
          return
        }
      }

      portaRef.current = porta
      pararRef.current = false
      bufferRef.current = ''
      ultimaRespostaRef.current = Date.now()
      setEstado('lendo')

      // Um writer por porta: pegar outro sem soltar o anterior trava o stream.
      if (!escritorRef.current && porta.writable) {
        escritorRef.current = porta.writable.getWriter()
      }

      void lerSempre(porta)
      void perguntarSempre()
    },
    // lerSempre/perguntarSempre sao estaveis (definidas abaixo, sem deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  /** Consome a porta sem parar, acumulando ate achar um peso. */
  const lerSempre = useCallback(async (porta: SerialPort) => {
    while (!pararRef.current && porta.readable) {
      const leitor = porta.readable.getReader()
      leitorRef.current = leitor
      try {
        for (;;) {
          const { value, done } = await leitor.read()
          if (done) break
          if (!value || value.length === 0) continue

          ultimaRespostaRef.current = Date.now()
          // A resposta chega picotada: acumula e guarda so a cauda, que e
          // onde a leitura mais nova sempre esta.
          bufferRef.current = (bufferRef.current + paraTexto(value)).slice(-600)

          const lido = extrairGramas(bufferRef.current)
          if (lido == null) continue

          setEstado('lendo')
          setGramas(lido)

          const rep = repeticaoRef.current
          if (rep && rep.gramas === lido) {
            rep.vezes += 1
            if (rep.vezes >= AMOSTRAS_PARA_ESTAVEL) setEstavel(true)
          } else {
            repeticaoRef.current = { gramas: lido, vezes: 1 }
            setEstavel(false)
          }
        }
      } catch (e) {
        if (!pararRef.current) {
          setErro(e instanceof Error ? e.message : 'Erro na leitura')
          setEstado('erro')
        }
      } finally {
        try {
          leitor.releaseLock()
        } catch {
          // ja liberado
        }
        leitorRef.current = null
      }
    }
  }, [])

  /** Manda ENQ no ritmo do INTERVALO_MS enquanto a porta estiver aberta. */
  const perguntarSempre = useCallback(async () => {
    while (!pararRef.current) {
      const escritor = escritorRef.current
      if (escritor) {
        try {
          await escritor.write(new Uint8Array([ENQ]))
        } catch {
          // Escrita falha quando o cabo sai no meio: o silencio abaixo
          // resolve o estado, nao precisa derrubar aqui.
        }
      }
      // Calou por tempo demais: some com o numero em vez de deixar na tela
      // um peso velho, que o operador leria como atual.
      if (Date.now() - ultimaRespostaRef.current > SILENCIO_MS) {
        setEstado('muda')
        setGramas(null)
        setEstavel(false)
        repeticaoRef.current = null
      }
      await new Promise((r) => setTimeout(r, INTERVALO_MS))
    }
  }, [])

  const conectar = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      setEstado('sem-suporte')
      return
    }
    try {
      const porta = await navigator.serial.requestPort()
      await abrir(porta)
    } catch (e) {
      // Cancelar o seletor nao e erro: a tela volta ao peso digitado.
      const msg = e instanceof Error ? e.message : 'Falha ao conectar'
      if (/no port selected|cancell?ed/i.test(msg)) return
      setErro(msg)
      setEstado('erro')
    }
  }, [abrir])

  /**
   * Reconecta sozinha ao carregar.
   *
   * Sem isto, todo restart do quiosque (e ele se atualiza sozinho) exigiria
   * alguem ir ate a tela autorizar a porta de novo — e a estacao voltaria
   * pedindo peso digitado no meio do almoco.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return
    let vivo = true
    void (async () => {
      try {
        const portas = await navigator.serial.getPorts()
        const porta = portas[0]
        if (vivo && porta) await abrir(porta)
      } catch {
        // sem porta autorizada ainda: segue no peso digitado
      }
    })()
    return () => {
      vivo = false
      pararRef.current = true
    }
  }, [abrir])

  return { estado, gramas, estavel, erro, conectar, desconectar }
}
