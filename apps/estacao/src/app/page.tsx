'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseScan } from '@/lib/parse-scan'
import {
  resolveBarcode,
  cancelItem,
  cancelOwnItem,
  setServiceMode,
  getRates,
  getCatalog,
  sendWeightItem,
  sendBarcodeItem,
  type StationSnapshot,
  type StationItem,
  type ServiceMode,
  type StationRates,
} from '@/lib/supabase'
import {
  enfileirar,
  listar,
  listarTudo,
  remover,
  novaChave,
  ehFalhaDeRede,
  guardarCatalogo,
  lerCatalogo,
  guardarTarifas,
  lerTarifas,
  guardarComanda,
  lerComandaRecente,
  guardarTokenAtivo,
  lerTokenAtivo,
  type Pendente,
  type ItemCatalogo,
} from '@/lib/queue'
import {
  formatCurrency,
  formatWeight,
  formatWeightProse,
  parseManualWeight,
  serviceModeLabel,
} from '@/lib/format'
import { NumericKeypad } from '@/components/numeric-keypad'

/**
 * Frente da estacao.
 *
 * Zero icones, de proposito. Numa tela que ja mostra peso e preco em corpo
 * grande, o glifo nao informa nada — a distincao entre um prato pesado e uma
 * bebida sai da tipografia, da regua colorida e do fio que separa as linhas.
 *
 * A lista de itens e uma comanda, nao um cartao por item: mono alinhada a
 * direita, nome, taxa, preco, linhas separadas por fio de 1px. Raios de 4px,
 * densidade de terminal.
 *
 * A leitura automatica da balanca (Web Serial, Toledo Prix IV) ainda nao
 * existe — falta o cabo. Ate la o peso entra a mao, que no desenho e via de
 * excecao de primeira classe e nao gambiarra: o campo mora no trilho da
 * comanda ativa, entao pratos 2..n tem caminho sem sair da tela. E como o
 * aparelho e uma tela touch sem teclado fisico, tocar em qualquer campo de
 * peso abre um teclado numerico na tela.
 *
 * Na comanda recem-aberta o teclado ja vem aberto e o peso decide a
 * modalidade sozinho: abaixo do ponto de equilibrio entra por quilo com o
 * prato lancado; acima, o por quilo custaria mais que o preco fixo e a
 * comanda vira a vontade. Ninguem paga o caminho mais caro por engano.
 */

type Toast = { id: number; kind: 'ok' | 'error'; text: string }

// Peso alto aguardando confirmacao no WeightGuard. A origem importa: vindo do
// seletor, o aceite ainda decide a modalidade; vindo do trilho, so lanca.
type PendingWeight = { grams: number; from: 'picker' | 'rail' }

// Item aguardando confirmacao de cancelamento. Pendente ainda nao subiu:
// cancelar e so tirar da fila. Item lancado passa pelo servidor, que impoe
// a janela de 15 min e protege o item fixo da modalidade.
type CancelTarget =
  | { kind: 'item'; item: StationItem }
  | { kind: 'pendente'; p: Pendente }

// Teclas do teclado numerico -> modalidade, na ordem em que aparecem na tela.
// A tecla nao e anunciada ali (o desenho nao mostra atalho nessa tela), mas
// serve de acelerador pra quem opera o dia inteiro.
const MODE_BY_KEY: Record<string, ServiceMode> = {
  '1': 'por_kg',
  '2': 'avontade',
}

// Acima disso pede confirmacao. Prato de self-service raramente passa de
// 1,5 kg. O desenho preve isto configuravel por restaurante (max 3.000 g);
// enquanto nao ha onde guardar, fica aqui.
const WEIGHT_CONFIRM_THRESHOLD = 1500

// Comanda mais velha que isto nao volta na tela depois de uma recarga: a essa
// altura ja passou pelo caixa.
const VALIDADE_DA_FOTO = 45 * 60 * 1000

// Barras de largura variada — o cartao e lido por codigo de barras, nao QR.
const BARCODE_WIDTHS = [
  3, 7, 2, 4, 9, 3, 2, 6, 4, 3, 8, 2, 5, 3, 7, 2, 9, 4, 3, 6, 2, 8, 3, 4, 2, 7,
]

function isPorKg(mode: ServiceMode | null): boolean {
  return mode === 'por_kg' || mode === 'por_kg_2mix'
}

function itemCountLabel(n: number): string {
  if (n === 0) return 'nenhum item'
  return n === 1 ? '1 item' : `${n} itens`
}

export default function StationPage() {
  const [session, setSession] = useState<StationSnapshot | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [cancelToken, setCancelToken] = useState<string | null>(null)
  const [buffer, setBuffer] = useState('')
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  // Peso alto aguardando confirmacao (null = nada pendente)
  const [pendingWeight, setPendingWeight] = useState<PendingWeight | null>(null)
  // Teclado numerico aberto, e de onde: o do seletor tambem escolhe o por
  // quilo; o do trilho so lanca o peso.
  const [weightPad, setWeightPad] = useState<'picker' | 'rail' | null>(null)
  // Item tocado na comanda, aguardando o toque de confirmacao do cancelamento
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null)
  // Reabre o seletor quando a atendente aperta a modalidade errada
  const [changingMode, setChangingMode] = useState(false)
  const [rates, setRates] = useState<StationRates | null>(null)
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  // Fila inteira, inclusive de comanda ja encerrada — e o que a tela de espera
  // mostra pra ninguem apagar o aparelho com lancamento por subir.
  const [pendentesTotal, setPendentesTotal] = useState(0)
  const [confirmarFinal, setConfirmarFinal] = useState(false)
  const [online, setOnline] = useState(true)
  const [clock, setClock] = useState('')
  const escoandoRef = useRef(false)
  // O escoamento roda solto no tempo e precisa saber qual comanda esta na tela
  // agora, nao qual estava quando ele comecou.
  const tokenRef = useRef<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const lastScanRef = useRef<{ value: string; ts: number } | null>(null)
  const cancelInFlightRef = useRef<boolean>(false)

  // Relogio do rodape da tela de espera. So depois da hidratacao, senao o
  // servidor renderiza um horario e o cliente outro.
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      )
    tick()
    const t = setInterval(tick, 20000)
    return () => clearInterval(t)
  }, [])

  // Auto-focus no input sempre que clicar em qualquer lugar
  useEffect(() => {
    const refocus = () => inputRef.current?.focus()
    refocus()
    window.addEventListener('click', refocus)
    window.addEventListener('touchend', refocus)
    return () => {
      window.removeEventListener('click', refocus)
      window.removeEventListener('touchend', refocus)
    }
  }, [])

  /**
   * Retoma a comanda depois de uma recarga.
   *
   * Recarregar acontece: o quiosque atualiza sozinho quando sai versao nova, e
   * o operador as vezes puxa a tela. Sem isto, a comanda some do balcao e os
   * itens da fila ficam orfaos — presos no aparelho, sem token na tela pra
   * escoar.
   *
   * Nao pergunta ao servidor de proposito: a unica RPC que devolve a comanda
   * pelo token e a que ABRE, e chama-la aqui criaria comanda vazia toda vez que
   * o caixa ja tivesse fechado a anterior.
   */
  useEffect(() => {
    let alive = true
    void (async () => {
      const salvo = await lerTokenAtivo()
      if (!alive || !salvo) return
      const foto = await lerComandaRecente<StationSnapshot>(salvo, VALIDADE_DA_FOTO)
      if (!alive) return
      if (foto) {
        setSession(foto)
        setToken(salvo)
      } else {
        // Some da tela, mas o que ficou na fila continua subindo: o pendente
        // guarda o proprio token e vai parar no pedido certo.
        void guardarTokenAtivo(null)
      }
      if (alive) setPendentesTotal((await listarTudo()).length)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  // Comanda aberta ainda sem modalidade: o teclado ja vem aberto — o caminho
  // comum e pesar o prato, e o peso decide a modalidade sozinho. Cancelar
  // deixa o seletor na mao, pra quem vai de a vontade sem prato na balanca.
  // Chaveado no order_id de proposito: fotos novas da MESMA comanda nao podem
  // reabrir o teclado que o operador acabou de fechar.
  useEffect(() => {
    if (session && session.service_mode == null) setWeightPad('picker')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.order_id])

  const pushToast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, kind, text }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])


  /**
   * O que a estacao precisa saber pra funcionar sem rede: as tarifas (pra
   * precificar a escolha e o prato) e o catalogo (pra nomear e precificar a
   * bebida bipada). Busca do servidor e guarda; se o servidor nao responder,
   * usa o que ficou guardado da ultima vez.
   */
  useEffect(() => {
    if (!token) return
    let alive = true

    void (async () => {
      try {
        const r = await getRates(token)
        if (!alive) return
        setRates(r)
        void guardarTarifas(token, r)
      } catch {
        const guardado = await lerTarifas<StationRates>(token)
        if (alive && guardado) setRates(guardado)
      }
      try {
        const c = await getCatalog(token)
        if (!alive) return
        setCatalogo(c)
        void guardarCatalogo(token, c)
      } catch {
        const guardado = await lerCatalogo(token)
        if (alive && guardado) setCatalogo(guardado)
      }
      if (alive) {
        setPendentes(await listar(token))
        setPendentesTotal((await listarTudo()).length)
      }
    })()

    return () => {
      alive = false
    }
  }, [token])


  // Define a modalidade da comanda. No "a vontade" o mesmo cartao pode
  // cobrir mais de uma pessoa — o servidor ajusta a quantidade do item fixo.
  const applyMode = useCallback(
    async (mode: ServiceMode, people = 1) => {
      if (!token) return
      try {
        setBusy(true)
        const snap = await setServiceMode(token, mode, people)
        setSession(snap)
        setChangingMode(false)
        setOnline(true)
        void guardarComanda(token, snap)
        pushToast(
          'ok',
          people === 1
            ? serviceModeLabel(mode)
            : `${serviceModeLabel(mode)} · ${people} pessoas`
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao definir modalidade'
        // A modalidade tambem nao entra na fila: ela precifica tudo que vem
        // depois, e um preco escolhido no aparelho nao vale nada se o servidor
        // recusar a modalidade quando a rede voltar.
        if (ehFalhaDeRede(msg)) {
          setOnline(false)
          pushToast('error', 'Sem rede — a modalidade precisa do servidor')
        } else {
          pushToast('error', msg)
        }
      } finally {
        setBusy(false)
      }
    },
    [token, pushToast]
  )

  /**
   * Envia o que estiver na fila, em ordem.
   *
   * Item que o servidor recusa sai da fila: ele nunca vai passar, e insistir
   * travaria tudo que veio depois atras de um lancamento que jamais entra.
   * Falha de rede, ao contrario, para o envio e mantem a ordem intacta.
   */
  const escoar = useCallback(async () => {
    if (escoandoRef.current) return
    escoandoRef.current = true
    try {
      // Toda a fila, nao so a da comanda na tela: o que ficou de uma comanda
      // ja encerrada tambem precisa subir, e cada pendente sabe seu token.
      const fila = await listarTudo()
      for (const p of fila) {
        const res =
          p.kind === 'weight'
            ? await sendWeightItem(p.token, p.weightGrams!, p.key)
            : await sendBarcodeItem(p.token, p.barcode!, p.key)

        if (res.ok) {
          await remover(p.key)
          setOnline(true)
          void guardarComanda(p.token, res.snapshot)
          // So repinta a tela se a foto for da comanda que esta nela.
          if (p.token === tokenRef.current) setSession(res.snapshot)
          continue
        }
        // A tentativa real vale mais que navigator.onLine: uma resposta que
        // chegou prova que ha rede, e uma falha de rede prova que nao ha —
        // mesmo com o Wi-Fi associado, que e o caso do salao.
        if (ehFalhaDeRede(res.error)) {
          setOnline(false)
          break
        }
        setOnline(true)
        await remover(p.key)
        pushToast('error', `${p.nome}: ${res.error}`)
      }
    } finally {
      escoandoRef.current = false
      const t = tokenRef.current
      setPendentes(t ? await listar(t) : [])
      setPendentesTotal((await listarTudo()).length)
    }
  }, [pushToast])

  /**
   * Encerra a comanda na tela. A comanda segue aberta no banco — quem fecha e
   * cobra e o caixa.
   *
   * Com item na fila, pede um segundo toque antes de encerrar. Barrar de vez
   * seria pior: numa queda de rede a estacao ficaria presa no mesmo cliente e
   * ninguem mais seria atendido, que e exatamente o travamento que a fila veio
   * evitar. O risco do outro lado — o cliente chegar ao caixa antes do item
   * subir — e real, entao nao passa em um toque so.
   *
   * A fila NAO e descartada: ela sobrevive a comanda e continua subindo em
   * segundo plano, com o token de origem, ate entrar.
   */
  const finishSession = useCallback(
    // `=== true` e nao `!forcado`: ligado direto num onClick, o React passa o
    // evento aqui, e qualquer objeto e truthy — a guarda cairia sozinha.
    (forcado = false) => {
      if (forcado !== true && pendentes.length > 0 && !confirmarFinal) {
        setConfirmarFinal(true)
        pushToast(
          'error',
          `${pendentes.length} ${pendentes.length === 1 ? 'item ainda não subiu' : 'itens ainda não subiram'} — toque de novo para encerrar assim mesmo`
        )
        void escoar()
        return
      }
      if (token) void guardarTokenAtivo(null)
      setSession(null)
      setToken(null)
      setCancelToken(null)
      setBuffer('')
      setPendingWeight(null)
      setWeightPad(null)
      setCancelTarget(null)
      setChangingMode(false)
      setConfirmarFinal(false)
      setRates(null)
      setCatalogo([])
      setPendentes([])
    },
    [token, pendentes.length, confirmarFinal, pushToast, escoar]
  )

  // A confirmacao nao fica armada: se o operador desistiu e foi lancar outro
  // prato, o proximo toque em Finalizar volta a avisar.
  useEffect(() => {
    if (!confirmarFinal) return
    const t = setTimeout(() => setConfirmarFinal(false), 8000)
    return () => clearTimeout(t)
  }, [confirmarFinal])

  // Auto-encerra apos 5 minutos de inatividade (comanda segue aberta no DB).
  // Depende de finishSession e nao so de session: a versao capturada precisa
  // enxergar a fila do momento, senao limparia a tela com item por subir.
  useEffect(() => {
    if (!session) return
    const t = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 5 * 60 * 1000) {
        finishSession()
      }
    }, 10000)
    return () => clearInterval(t)
  }, [session, finishSession])

  /**
   * Lanca um item.
   *
   * Entra na fila primeiro, aparece na comanda na hora e so depois vai pra
   * rede. O operador nunca espera, e uma queda no meio nao perde o item —
   * ele fica guardado e sobe quando a rede voltar.
   */
  const lancar = useCallback(
    async (p: Omit<Pendente, 'key' | 'token' | 'at'>) => {
      if (!token) return
      const item: Pendente = {
        ...p,
        key: novaChave(),
        token,
        at: Date.now(),
      }
      await enfileirar(item)
      setPendentes(await listar(token))
      setPendentesTotal((await listarTudo()).length)
      pushToast('ok', `+ ${p.qty}`)
      void escoar()
    },
    [token, pushToast, escoar]
  )

  /**
   * Estado da rede e reenvio.
   *
   * Volta a rede, escoa. E tenta de novo a cada 20 s enquanto houver fila:
   * o evento `online` do navegador mente com frequencia — ele dispara com
   * Wi-Fi associado mas sem internet de verdade, que e exatamente o cenario
   * de rede fraca.
   */
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    const aoVoltar = () => {
      sync()
      void escoar()
    }
    window.addEventListener('online', aoVoltar)
    window.addEventListener('offline', sync)
    const t = setInterval(() => {
      if (pendentesTotal > 0) void escoar()
    }, 20000)
    return () => {
      window.removeEventListener('online', aoVoltar)
      window.removeEventListener('offline', sync)
      clearInterval(t)
    }
  }, [escoar, pendentesTotal])

  const applyManualWeight = useCallback(
    async (grams: number) => {
      if (!token) return
      const taxaKg = rates?.[session?.service_mode ?? 'por_kg']?.price_per_kg
      await lancar({
        kind: 'weight',
        weightGrams: grams,
        nome: 'Prato por quilo',
        qty: formatWeight(grams),
        taxa: taxaKg != null ? `${formatCurrency(taxaKg)}/kg` : '',
        // Otimista: o servidor recalcula em numeric e a foto seguinte corrige
        // qualquer centavo de diferenca.
        total: taxaKg != null ? (taxaKg * grams) / 1000 : 0,
      })
    },
    [token, lancar, rates, session]
  )

  // Valida e lanca um peso digitado, de qualquer origem — Enter no campo ou
  // teclado na tela. Peso alto para no WeightGuard antes de entrar.
  const submitManualWeight = useCallback(
    (grams: number) => {
      if (grams <= 0) {
        pushToast('error', 'Peso invalido')
        return
      }
      if (grams > WEIGHT_CONFIRM_THRESHOLD) {
        setPendingWeight({ grams, from: 'rail' })
        return
      }
      void applyManualWeight(grams)
    },
    [applyManualWeight, pushToast]
  )

  /**
   * Peso digitado no seletor: a modalidade sai do peso, nao de um toque.
   *
   * Acima do ponto de equilibrio o por quilo custaria mais que o preco fixo,
   * entao a comanda entra como a vontade sozinha — ninguem paga o caminho
   * mais caro por engano. Abaixo, escolhe o por quilo e ja lanca o prato.
   * A modalidade continua fora da fila — ela precifica tudo que vem depois e
   * precisa do servidor — entao o peso so entra depois dela aceita.
   */
  const decidirPeloPeso = useCallback(
    async (grams: number) => {
      if (!token) return
      const perKg = rates?.por_kg?.price_per_kg
      const buffet = rates?.avontade
      const totalPorKg = perKg != null ? (grams * perKg) / 1000 : null
      const viraAvontade =
        buffet?.ready === true &&
        buffet.price != null &&
        totalPorKg != null &&
        totalPorKg >= buffet.price

      try {
        setBusy(true)
        const snap = await setServiceMode(
          token,
          viraAvontade ? 'avontade' : 'por_kg',
          1
        )
        setSession(snap)
        setChangingMode(false)
        setOnline(true)
        void guardarComanda(token, snap)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao definir modalidade'
        if (ehFalhaDeRede(msg)) {
          setOnline(false)
          pushToast('error', 'Sem rede — a modalidade precisa do servidor')
        } else {
          pushToast('error', msg)
        }
        return
      } finally {
        setBusy(false)
      }

      if (viraAvontade) {
        pushToast(
          'ok',
          totalPorKg != null
            ? `No quilo, ${formatWeightProse(grams)} sairia ${formatCurrency(totalPorKg)} — entrou como à vontade`
            : 'Entrou como à vontade'
        )
        return
      }
      void applyManualWeight(grams)
    },
    [token, rates, pushToast, applyManualWeight]
  )

  // Valida e aplica o guarda de peso alto antes de decidir: um typo aqui nao
  // so lancaria peso errado — viraria a comanda pra modalidade errada.
  const pesoDoSeletor = useCallback(
    (grams: number) => {
      if (grams <= 0) {
        pushToast('error', 'Peso invalido')
        return
      }
      if (grams > WEIGHT_CONFIRM_THRESHOLD) {
        setPendingWeight({ grams, from: 'picker' })
        return
      }
      void decidirPeloPeso(grams)
    },
    [decidirPeloPeso, pushToast]
  )

  /**
   * Executa o cancelamento confirmado no dialogo.
   *
   * Pendente ainda nao subiu: sai da fila e pronto. Se o envio tiver
   * acontecido no meio do caminho, o item reaparece como lancado na foto
   * seguinte — e dai se cancela pelo caminho do servidor.
   */
  const executarCancelamento = useCallback(async () => {
    const alvo = cancelTarget
    if (!alvo) return
    setCancelTarget(null)
    lastActivityRef.current = Date.now()

    if (alvo.kind === 'pendente') {
      await remover(alvo.p.key)
      setPendentes(token ? await listar(token) : [])
      setPendentesTotal((await listarTudo()).length)
      pushToast('ok', 'Item removido')
      return
    }

    if (!token) return
    try {
      setBusy(true)
      const snap = await cancelOwnItem(token, alvo.item.id)
      setSession(snap)
      setOnline(true)
      void guardarComanda(token, snap)
      pushToast('ok', 'Item cancelado')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao cancelar'
      // Igual ao cancel do caixa: nao entra na fila. Tirar da tela sem
      // tirar do banco faria o caixa cobrar um item que o cliente viu sumir.
      if (ehFalhaDeRede(msg)) {
        setOnline(false)
        pushToast('error', 'Sem rede — não dá para cancelar agora')
      } else {
        pushToast('error', msg)
      }
    } finally {
      setBusy(false)
    }
  }, [cancelTarget, token, pushToast])

  const handleScan = useCallback(
    async (raw: string) => {
      // Dedup: evita scan duplicado em <2s (camera dispara muitas vezes por segundo)
      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.value === raw && now - last.ts < 2000) return
      lastScanRef.current = { value: raw, ts: now }

      const scan = parseScan(raw)
      lastActivityRef.current = now

      if (scan.kind === 'unknown') {
        pushToast('error', `Codigo nao reconhecido: ${scan.raw.slice(0, 20)}`)
        return
      }

      // Sem comanda aberta: so cartao de cliente entra.
      if (!session) {
        if (scan.kind !== 'card_barcode') {
          pushToast('error', 'Bipe o codigo de barras do cartao primeiro')
          return
        }
        try {
          setBusy(true)
          const res = await resolveBarcode(scan.barcode)
          if (res.kind === 'cancel') {
            pushToast('error', 'Abra uma comanda antes de usar o cartao de cancelamento')
            return
          }
          setSession(res.session)
          setToken(res.qr_token)
          setOnline(true)
          void guardarTokenAtivo(res.qr_token)
          void guardarComanda(res.qr_token, res.session)
          pushToast('ok', `Comanda ${res.session.comanda_card.card_number} aberta`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro ao abrir comanda'
          // Abrir comanda e a unica coisa que a estacao nao consegue adiar: o
          // numero do pedido nasce no banco, e sem ele nao ha onde pendurar
          // item nenhum.
          if (ehFalhaDeRede(msg)) {
            setOnline(false)
            pushToast('error', 'Sem rede — não dá para abrir comanda agora')
          } else {
            pushToast('error', msg)
          }
        } finally {
          setBusy(false)
        }
        return
      }

      if (!token) return

      if (scan.kind === 'card_barcode') {
        try {
          setBusy(true)
          const res = await resolveBarcode(scan.barcode)
          if (res.kind === 'cancel') {
            setCancelToken(res.qr_token)
            pushToast('ok', 'Modo cancelamento — toque no item pra cancelar')
          } else {
            pushToast('error', 'Ja existe uma comanda aberta — finalize antes')
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erro'
          pushToast('error', msg)
        } finally {
          setBusy(false)
        }
        return
      }

      if (scan.kind === 'weight') {
        const taxaKg = rates?.[session.service_mode ?? 'por_kg']?.price_per_kg
        await lancar({
          kind: 'weight',
          weightGrams: scan.weightGrams,
          nome: 'Prato por quilo',
          qty: formatWeight(scan.weightGrams),
          taxa: taxaKg != null ? `${formatCurrency(taxaKg)}/kg` : '',
          total: taxaKg != null ? (taxaKg * scan.weightGrams) / 1000 : 0,
        })
        return
      }

      // O codigo de barras e resolvido no servidor, entao offline o nome e o
      // preco saem do catalogo guardado. Sem catalogo ainda, o item entra na
      // fila mesmo assim — o que nao da e fingir um preco que nao se sabe.
      const doCatalogo = catalogo.find((c) => c.barcode === scan.code)
      await lancar({
        kind: 'barcode',
        barcode: scan.code,
        nome: doCatalogo?.name ?? `Codigo ${scan.code}`,
        qty: '1 un',
        taxa: doCatalogo ? `${formatCurrency(doCatalogo.price)} cada` : '',
        total: doCatalogo?.price ?? 0,
      })
    },
    [session, token, pushToast, lancar, rates, catalogo]
  )

  // O leitor HID "digita" no input + Enter ao final. Um input so atende tudo:
  // leitor, modalidade, e peso digitado. Nao ha colisao — o leitor manda 8+
  // digitos e a digitacao manual e sempre curta.
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && weightPad != null) {
      e.preventDefault()
      setWeightPad(null)
      return
    }
    if (e.key === 'Escape' && pendingWeight != null) {
      e.preventDefault()
      setPendingWeight(null)
      return
    }

    if (e.key !== 'Enter') return
    e.preventDefault()

    const v = e.currentTarget.value.trim()
    e.currentTarget.value = ''
    setBuffer('')

    // 1) Confirmacao de peso alto pendente — Enter confirma
    if (pendingWeight != null) {
      const p = pendingWeight
      setPendingWeight(null)
      if (p.from === 'picker') void decidirPeloPeso(p.grams)
      else void applyManualWeight(p.grams)
      return
    }

    if (!v) return

    // 2) Comanda aberta sem modalidade: 1 / 2, ou o peso direto
    if (session && (!session.service_mode || changingMode)) {
      const mode = MODE_BY_KEY[v]
      if (mode) {
        void applyMode(mode)
        return
      }
      // Peso digitado no teclado fisico ainda no seletor: mesmo caminho do
      // teclado na tela — o peso decide a modalidade.
      const grams = parseManualWeight(v)
      if (grams != null) {
        pesoDoSeletor(grams)
        return
      }
      pushToast('error', 'Toque em Por quilo ou À vontade')
      return
    }

    // 3) "Por quilo": peso digitado (gramas ou quilos)
    if (session && isPorKg(session.service_mode)) {
      const grams = parseManualWeight(v)
      if (grams != null) {
        submitManualWeight(grams)
        return
      }
    }

    // 4) Resto e scan
    handleScan(v)
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-bg text-ink">
      {!session ? (
        <>
          <IdleView
            clock={clock}
            busy={busy}
            online={online}
            naFila={pendentesTotal}
          />
          <input
            ref={inputRef}
            autoFocus
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            onKeyDown={onInputKeyDown}
            inputMode="none"
            className="absolute h-0 w-0 opacity-0"
            aria-label="Leitor de codigo de barras"
          />
        </>
      ) : (
        <ActiveView
          session={session}
          rates={rates}
          pendentes={pendentes}
          online={online}
          busy={busy}
          onFinish={() => finishSession()}
          confirmarFinal={confirmarFinal}
          inputRef={inputRef}
          buffer={buffer}
          setBuffer={setBuffer}
          onInputKeyDown={onInputKeyDown}
          onPickMode={(m) => void applyMode(m)}
          onOpenKeypad={(from) => {
            lastActivityRef.current = Date.now()
            setWeightPad(from)
          }}
          onSetPeople={(n) => void applyMode('avontade', n)}
          onTapCancel={(alvo) => {
            lastActivityRef.current = Date.now()
            setCancelTarget(alvo)
          }}
          changingMode={changingMode}
          onStartChangeMode={() => setChangingMode(true)}
          cancelToken={cancelToken}
          onCloseCancelMode={() => setCancelToken(null)}
          onCancelItem={async (itemId) => {
            if (!cancelToken) return
            if (cancelInFlightRef.current) return
            cancelInFlightRef.current = true
            try {
              setBusy(true)
              const snap = await cancelItem(cancelToken, session.order_id, itemId)
              setSession(snap)
              setOnline(true)
              if (token) void guardarComanda(token, snap)
              pushToast('ok', 'Item cancelado')
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Erro ao cancelar'
              // Cancelar nao entra na fila: tirar da tela sem tirar do banco
              // faria o caixa cobrar um item que o cliente viu sumir.
              if (ehFalhaDeRede(msg)) {
                setOnline(false)
                pushToast('error', 'Sem rede — não dá para cancelar agora')
              } else {
                pushToast('error', msg)
              }
            } finally {
              setBusy(false)
              setTimeout(() => {
                cancelInFlightRef.current = false
              }, 300)
            }
          }}
        />
      )}

      {weightPad != null && (
        <NumericKeypad
          busy={busy}
          onClose={() => setWeightPad(null)}
          onConfirm={(grams) => {
            const origem = weightPad
            setWeightPad(null)
            lastActivityRef.current = Date.now()
            if (origem === 'picker') pesoDoSeletor(grams)
            else submitManualWeight(grams)
          }}
          // Atalho pra quem nao vai pesar: sem ele, o cliente de a vontade
          // teria que cancelar o teclado e cacar a opcao na tela de tras.
          altLabel={
            weightPad === 'picker' && rates?.avontade?.ready !== false
              ? 'À vontade, sem pesar'
              : undefined
          }
          onAlt={
            weightPad === 'picker' && rates?.avontade?.ready !== false
              ? () => {
                  setWeightPad(null)
                  lastActivityRef.current = Date.now()
                  void applyMode('avontade')
                }
              : undefined
          }
        />
      )}

      {cancelTarget != null && (
        <CancelConfirm
          target={cancelTarget}
          busy={busy}
          onVoltar={() => setCancelTarget(null)}
          onConfirmar={() => void executarCancelamento()}
        />
      )}

      {pendingWeight != null && (
        <WeightGuard
          grams={pendingWeight.grams}
          threshold={WEIGHT_CONFIRM_THRESHOLD}
          onCorrigir={() => setPendingWeight(null)}
          onAceitar={() => {
            const p = pendingWeight
            setPendingWeight(null)
            if (p.from === 'picker') void decidirPeloPeso(p.grams)
            else void applyManualWeight(p.grams)
          }}
        />
      )}

      <Toasts toasts={toasts} inset={!!session} />
    </main>
  )
}

/* ---------------------------------------------------------------- */

function IdleView({
  clock,
  busy,
  online,
  naFila,
}: {
  clock: string
  busy: boolean
  online: boolean
  naFila: number
}) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-11 px-16">
        <div className="flex h-[132px] items-end gap-[5px]" aria-hidden>
          {BARCODE_WIDTHS.map((w, i) => (
            <span
              key={i}
              className="h-full rounded-[2px] bg-teal"
              style={{
                width: `${w}px`,
                opacity: i % 3 === 0 ? 0.9 : i % 3 === 1 ? 0.55 : 0.75,
                animation: 'est-breathe 2.4s ease-in-out infinite',
                animationDelay: `${i * 60}ms`,
              }}
            />
          ))}
        </div>
        <div className="text-center">
          <h1 className="m-0 text-[62px] font-semibold leading-[1.02] tracking-[-0.03em]">
            Bipe seu cartão
          </h1>
          <p className="mt-3.5 text-2xl leading-[1.4] text-ink-soft">
            Passe o código de barras no leitor para abrir a comanda
          </p>
        </div>
      </div>
      <div className="flex h-[76px] shrink-0 items-center gap-4 border-t border-rule px-10">
        {/* O aviso mora aqui, e não num alerta no meio da tela: sem rede o
            leitor continua lendo, o que não dá é nascer comanda nova. */}
        <span
          className={
            'h-[9px] w-[9px] shrink-0 rounded-full ' +
            (online ? 'bg-teal' : 'bg-amber')
          }
          style={{ animation: 'est-breathe 2s ease-in-out infinite' }}
        />
        <span className="text-[15px] text-ink-muted">
          {busy
            ? 'Abrindo comanda…'
            : online
              ? 'Leitor pronto'
              : 'Sem rede — comanda nova só quando a conexão voltar'}
        </span>
        <div className="flex-1" />
        {/* Fila que sobrou de comanda já encerrada. Aparece aqui para ninguém
            desligar o aparelho com lançamento por subir. */}
        {naFila > 0 && (
          <span className="rounded-[4px] border border-amber-edge bg-amber-soft px-3 py-1.5 text-[13px] font-semibold text-amber">
            {naFila === 1
              ? '1 lançamento ainda subindo'
              : `${naFila} lançamentos ainda subindo`}
          </span>
        )}
        <span className="text-[15px] text-ink-muted">Txoko · Estação</span>
        <span className="font-mono text-[15px] text-ink-soft">{clock}</span>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- */

function ActiveView({
  session,
  rates,
  pendentes,
  online,
  busy,
  onFinish,
  confirmarFinal,
  inputRef,
  buffer,
  setBuffer,
  onInputKeyDown,
  onPickMode,
  onOpenKeypad,
  onSetPeople,
  onTapCancel,
  changingMode,
  onStartChangeMode,
  cancelToken,
  onCloseCancelMode,
  onCancelItem,
}: {
  session: StationSnapshot
  rates: StationRates | null
  pendentes: Pendente[]
  online: boolean
  busy: boolean
  onFinish: () => void
  confirmarFinal: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  buffer: string
  setBuffer: (v: string) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onPickMode: (mode: ServiceMode) => void
  onOpenKeypad: (from: 'picker' | 'rail') => void
  onSetPeople: (n: number) => void
  onTapCancel: (alvo: CancelTarget) => void
  changingMode: boolean
  onStartChangeMode: () => void
  cancelToken: string | null
  onCloseCancelMode: () => void
  onCancelItem: (itemId: string) => void
}) {
  const mode = session.service_mode
  const scrollRef = useRef<HTMLDivElement>(null)
  const pickingMode = mode == null || changingMode

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [session.items.length, pendentes.length])

  const comandaLabel = String(session.comanda_card.card_number).padStart(3, '0')

  if (pickingMode) {
    return (
      <ModePicker
        comandaLabel={comandaLabel}
        rates={rates}
        busy={busy}
        trocando={changingMode}
        onPick={onPickMode}
        onOpenKeypad={() => onOpenKeypad('picker')}
        inputRef={inputRef}
        buffer={buffer}
        setBuffer={setBuffer}
        onInputKeyDown={onInputKeyDown}
      />
    )
  }

  const porKg = isPorKg(mode)

  // O que a comanda vale hoje, incluindo o que ainda nao subiu. Mostrar so o
  // total confirmado enquanto ha item na fila daria um numero menor que o
  // prato que o cliente ja tem na mao.
  const totalComPendentes =
    session.total + pendentes.reduce((soma, p) => soma + p.total, 0)

  // A taxa vigente ao lado da modalidade: e ela que precifica tudo que entra
  // depois, entao vem antes do numero da comanda.
  const rate = mode ? rates?.[mode] : null
  const activeRate = porKg
    ? rate?.price_per_kg != null
      ? `${formatCurrency(rate.price_per_kg)}/kg`
      : null
    : rate?.price != null
      ? `${formatCurrency(rate.price)} por pessoa`
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabeçalho: a modalidade e a taxa vêm antes do número da comanda,
          porque é o que muda o preço de tudo que entra depois. */}
      <div className="flex h-[92px] shrink-0 items-center gap-5 border-b border-rule px-11">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span
              className={
                'text-xs font-bold uppercase tracking-[0.12em] ' +
                (porKg ? 'text-amber' : 'text-teal')
              }
            >
              {serviceModeLabel(mode)}
            </span>
            {activeRate && (
              <span className="font-mono text-[13px] text-ink-muted">
                {activeRate}
              </span>
            )}
          </div>
          <p className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">
            Comanda <span className="font-mono font-bold">#{comandaLabel}</span>
          </p>
        </div>
        <div className="flex-1" />
        {/* Só aparece quando há o que dizer. Um indicador permanente de rede
            vira parte do cenário e ninguém repara nele quando muda. */}
        {(!online || pendentes.length > 0) && (
          <div
            role="status"
            className="rounded-[4px] border border-amber-edge bg-amber-soft px-4 py-2 text-right"
          >
            <p className="text-[11.5px] font-bold uppercase tracking-[0.09em] text-amber">
              {online ? 'Enviando' : 'Sem rede'}
            </p>
            <p className="mt-0.5 font-mono text-[13px] text-ink-soft">
              {pendentes.length === 0
                ? 'comanda em dia'
                : `${pendentes.length} ${pendentes.length === 1 ? 'item na fila' : 'itens na fila'}`}
            </p>
          </div>
        )}
        <button
          onClick={onStartChangeMode}
          disabled={busy}
          className="min-h-12 rounded-[4px] border border-rule-strong px-5 text-[15px] font-semibold text-ink-soft disabled:opacity-40"
        >
          Trocar modalidade
        </button>
        {/* Com item na fila o botão muda de rótulo e de cor: quem encerra
            assim está tomando uma decisão, não repetindo um gesto. */}
        <button
          onClick={onFinish}
          className={
            'min-h-12 rounded-[4px] px-6 text-base font-bold ' +
            (confirmarFinal
              ? 'bg-amber text-on-amber'
              : 'bg-teal text-on-accent')
          }
        >
          {confirmarFinal ? 'Encerrar assim mesmo' : 'Finalizar'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Coluna dos itens — comanda, não cartões */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-baseline gap-3 px-11 pb-2.5 pt-6">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
              Itens da comanda
            </p>
            <span className="font-mono text-[13px] text-ink-muted">
              {itemCountLabel(session.items.length + pendentes.length)}
            </span>
            <span className="flex-1" />
            {session.items.length + pendentes.length > 0 && (
              <span className="text-[13px] text-ink-muted">
                toque num item para cancelar
              </span>
            )}
          </div>
          <div
            ref={scrollRef}
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-11 pb-6"
          >
            {session.items.length === 0 && pendentes.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3.5 text-center">
                <p className="text-[21px] font-medium text-ink-soft">
                  Nenhum item ainda
                </p>
                <p className="max-w-[380px] text-[17px] text-ink-muted">
                  {porKg
                    ? 'Digite o peso do prato ou passe a bebida no leitor.'
                    : 'Passe a bebida no leitor.'}
                </p>
              </div>
            ) : (
              <>
                {session.items.map((item, i) => (
                  <ComandaRow
                    key={item.id}
                    item={item}
                    isLast={
                      pendentes.length === 0 && i === session.items.length - 1
                    }
                    // O fixo da modalidade nao cancela avulso: quem mexe nele
                    // e o numero de pessoas e a troca de modalidade.
                    onTap={
                      item.service_mode != null && item.weight_grams == null
                        ? undefined
                        : () => onTapCancel({ kind: 'item', item })
                    }
                  />
                ))}
                {/* Pendentes entram na mesma comanda, na mesma linha, com o
                    mesmo peso visual — porque para o cliente ja entraram. O
                    que muda e a etiqueta: quem opera precisa saber o que ainda
                    nao subiu antes de mandar a pessoa pro caixa. */}
                {pendentes.map((p, i) => (
                  <PendenteRow
                    key={p.key}
                    p={p}
                    isLast={i === pendentes.length - 1}
                    onTap={() => onTapCancel({ kind: 'pendente', p })}
                  />
                ))}
              </>
            )}
          </div>
        </section>

        {/* Trilho: o peso (ou o preço por pessoa) e o total */}
        <aside className="flex w-[420px] shrink-0 flex-col border-l border-rule px-9 pb-8 pt-6">
          {porKg ? (
            <WeightRail
              inputRef={inputRef}
              buffer={buffer}
              setBuffer={setBuffer}
              onInputKeyDown={onInputKeyDown}
              onOpenKeypad={() => onOpenKeypad('rail')}
            />
          ) : (
            <AvontadeRail
              session={session}
              busy={busy}
              onSetPeople={onSetPeople}
              inputRef={inputRef}
              buffer={buffer}
              setBuffer={setBuffer}
              onInputKeyDown={onInputKeyDown}
            />
          )}

          <div className="flex-1" />

          <p className="mb-[22px] border-t border-rule pt-5 text-sm leading-[1.4] text-ink-soft">
            {porKg
              ? 'Passe a bebida no leitor · o peso do prato entra à mão'
              : 'Passe as bebidas no leitor'}
          </p>

          {/* Total em bloco próprio: é o número que o cliente lê do outro
              lado do balcão. */}
          <div className="rounded-[4px] bg-teal-soft px-6 pb-6 pt-[22px]">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Total
            </span>
            <p className="mt-2.5 font-mono text-[62px] font-bold leading-none tracking-[-0.045em] text-ink">
              {formatCurrency(totalComPendentes)}
            </p>
          </div>
        </aside>
      </div>

      {cancelToken && (
        <CancelSheet
          items={session.items}
          busy={busy}
          onCancelItem={onCancelItem}
          onClose={onCloseCancelMode}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- */

/**
 * Linha de item que ainda nao subiu.
 *
 * Mesma grade e mesmo corpo do item confirmado: para o cliente ele ja entrou,
 * e uma linha menor ou apagada sugeriria o contrario. O que distingue e a
 * etiqueta e o ambar — a cor que a tela ja usa pra "ainda nao resolvido".
 */
function PendenteRow({
  p,
  isLast,
  onTap,
}: {
  p: Pendente
  isLast: boolean
  onTap: () => void
}) {
  return (
    <button
      onClick={onTap}
      className="grid w-full grid-cols-[112px_minmax(0,1fr)_auto] items-baseline gap-[22px] border-b border-rule-faint py-[17px] text-left active:bg-red-soft"
      style={isLast ? { animation: 'est-land .22s ease-out' } : undefined}
    >
      <span className="text-right font-mono text-lg font-bold text-amber">
        {p.qty}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2.5">
          <span className="truncate text-[19px] font-medium">{p.nome}</span>
          <span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.09em] text-amber">
            na fila
          </span>
        </span>
        <span className="mt-[3px] block font-mono text-[13.5px] text-ink-muted">
          {p.taxa || 'valor confirma quando subir'}
        </span>
      </span>
      <span className="font-mono text-[22px] font-bold tracking-[-0.01em] text-amber">
        {p.total > 0 ? formatCurrency(p.total) : '—'}
      </span>
    </button>
  )
}

/* ---------------------------------------------------------------- */

function ComandaRow({
  item,
  isLast,
  onTap,
}: {
  item: StationItem
  isLast: boolean
  // Ausente no item fixo da modalidade, que nao cancela avulso.
  onTap?: () => void
}) {
  const isWeight = item.weight_grams != null
  return (
    <button
      onClick={onTap}
      disabled={onTap == null}
      className="grid w-full grid-cols-[112px_minmax(0,1fr)_auto] items-baseline gap-[22px] border-b border-rule-faint py-[17px] text-left active:bg-red-soft disabled:cursor-default disabled:active:bg-transparent"
      style={isLast ? { animation: 'est-land .22s ease-out' } : undefined}
    >
      <span
        className={
          'text-right font-mono text-lg font-bold ' +
          (isWeight ? 'text-amber' : 'text-ink-soft')
        }
      >
        {isWeight ? formatWeight(item.weight_grams) : `${item.quantity} un`}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2.5">
          <span className="truncate text-[19px] font-medium">
            {item.product_name}
          </span>
          {isLast && (
            <span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.09em] text-teal">
              lançado
            </span>
          )}
        </span>
        <span className="mt-[3px] block font-mono text-[13.5px] text-ink-muted">
          {isWeight
            ? `${formatCurrency(item.unit_price)}/kg`
            : `${formatCurrency(item.unit_price)} cada`}
        </span>
      </span>
      <span className="font-mono text-[22px] font-bold tracking-[-0.01em]">
        {formatCurrency(item.total_price)}
      </span>
    </button>
  )
}

/* ---------------------------------------------------------------- */

function WeightRail({
  inputRef,
  buffer,
  setBuffer,
  onInputKeyDown,
  onOpenKeypad,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  buffer: string
  setBuffer: (v: string) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onOpenKeypad: () => void
}) {
  const parsed = parseManualWeight(buffer)
  const willLaunch = parsed != null && parsed > 0

  return (
    <div>
      {/* Sem cabo serial a balança está muda, e este é o estado normal —
          não um erro. O peso digitado é conferido contra o visor da balança,
          então é o segundo maior número da tela. */}
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-amber">
        Balança desconectada
      </span>
      <div className="mt-3 flex items-baseline gap-2.5">
        <span
          className={
            'font-mono text-[68px] font-bold leading-none tracking-[-0.04em] ' +
            (willLaunch ? 'text-ink' : 'text-ink-muted')
          }
        >
          {willLaunch ? parsed : '—'}
        </span>
        <span className="font-mono text-2xl text-ink-muted">g</span>
      </div>
      <p className="mt-3 min-h-10 text-sm leading-[1.45] text-ink-muted">
        {willLaunch
          ? `${formatWeight(parsed)} entra na comanda com Enter`
          : 'Sem leitura da balança. Digite o peso do próximo prato.'}
      </p>
      {/* inputMode="none": o teclado e o nosso, na tela — tocar aqui abre o
          numerico sem o teclado do sistema subir por cima do quiosque. Quem
          tem teclado fisico segue digitando direto, sem tocar no campo. */}
      <input
        ref={inputRef}
        autoFocus
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={onInputKeyDown}
        onClick={onOpenKeypad}
        inputMode="none"
        placeholder="485"
        aria-label="Peso do prato em gramas ou quilos"
        autoComplete="off"
        spellCheck={false}
        className="mt-1 h-[52px] w-full rounded-[4px] border border-rule-strong bg-bg px-4 font-mono text-[19px] text-ink"
      />
      <p className="mt-2 text-[13px] leading-[1.35] text-ink-soft">
        Toque no campo para digitar · gramas (
        <span className="font-mono">485</span>) ou quilos (
        <span className="font-mono">0,485</span>)
      </p>
      {/* O campo ja abre o teclado, mas "adicionar mais um prato" precisa de
          um verbo na tela — o botao e o mesmo gesto, com nome. */}
      <button
        onClick={onOpenKeypad}
        className="mt-4 min-h-[56px] w-full rounded-[4px] border border-rule-strong text-base font-semibold text-ink-soft"
      >
        Adicionar prato
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- */

function AvontadeRail({
  session,
  busy,
  onSetPeople,
  inputRef,
  buffer,
  setBuffer,
  onInputKeyDown,
}: {
  session: StationSnapshot
  busy: boolean
  onSetPeople: (n: number) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  buffer: string
  setBuffer: (v: string) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  // O item fixo da modalidade diz quantas pessoas o cartao cobre. Foto
  // guardada por versao antiga nao traz service_mode — cai em 1 e a
  // proxima foto do servidor corrige.
  const fixo = session.items.find(
    (i) => i.weight_grams == null && i.service_mode === 'avontade'
  )
  const people = fixo?.quantity ?? 1

  return (
    <div>
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-teal">
        Preço por pessoa
      </span>
      <p className="mt-3 font-mono text-[52px] font-bold leading-none tracking-[-0.035em]">
        {formatCurrency(fixo?.unit_price ?? session.subtotal)}
      </p>
      {/* Mais de um comendo no mesmo cartao: ajusta aqui e o servidor muda a
          quantidade do item fixo — nao existe "segunda comanda" pra isso. */}
      <div className="mt-5 flex items-center gap-4">
        <span className="text-[15px] font-semibold text-ink-soft">Pessoas</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSetPeople(people - 1)}
            disabled={busy || people <= 1}
            aria-label="Uma pessoa a menos"
            className="h-12 w-12 rounded-[4px] border border-rule-strong font-mono text-2xl font-bold text-ink disabled:opacity-40"
          >
            −
          </button>
          <span className="w-10 text-center font-mono text-[24px] font-bold">
            {people}
          </span>
          <button
            onClick={() => onSetPeople(people + 1)}
            disabled={busy || people >= 20}
            aria-label="Uma pessoa a mais"
            className="h-12 w-12 rounded-[4px] border border-rule-strong font-mono text-2xl font-bold text-ink disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
      <p className="mt-4 text-[15px] leading-[1.45] text-ink-muted">
        Já lançado na comanda. Bebidas entram pelo leitor.
      </p>
      <input
        ref={inputRef}
        autoFocus
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={onInputKeyDown}
        inputMode="none"
        className="absolute h-0 w-0 opacity-0"
        aria-label="Leitor de código de barras"
      />
    </div>
  )
}

/* ---------------------------------------------------------------- */

/**
 * O peso a partir do qual o a vontade fica mais barato que o por quilo.
 *
 * Sai so das duas tarifas, sem depender da balanca — e a informacao que faz a
 * escolha deixar de ser as cegas enquanto nao ha leitura automatica. Com
 * R$ 59,90 fixos contra R$ 79,90/kg, o ponto e 750 g.
 */
function breakEvenHint(rates: StationRates | null): string | null {
  const buffet = rates?.avontade?.price
  const perKg = rates?.por_kg?.price_per_kg
  if (!rates?.avontade?.ready || !rates?.por_kg?.ready) return null
  if (buffet == null || perKg == null || perKg <= 0) return null
  const grams = Math.round((buffet / perKg) * 1000)
  return `Acima de ${grams.toLocaleString('pt-BR')} g o à vontade sai na frente`
}

// Duas opções, na ordem do desenho: por quilo primeiro, porque é a que depende
// do peso e a que o cliente decide olhando o prato. A modalidade de 2 misturas
// existe no banco e continua valendo em comandas antigas, mas saiu da escolha
// do cliente — três caminhos numa tela de autoatendimento é um a mais.
const MODE_OPTIONS: {
  mode: ServiceMode
  title: string
  tone: 'amber' | 'teal'
}[] = [
  { mode: 'por_kg', title: 'Por quilo', tone: 'amber' },
  { mode: 'avontade', title: 'À vontade', tone: 'teal' },
]

function ModePicker({
  comandaLabel,
  rates,
  busy,
  trocando,
  onPick,
  onOpenKeypad,
  inputRef,
  buffer,
  setBuffer,
  onInputKeyDown,
}: {
  comandaLabel: string
  rates: StationRates | null
  busy: boolean
  trocando: boolean
  onPick: (mode: ServiceMode) => void
  onOpenKeypad: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  buffer: string
  setBuffer: (v: string) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  // Mesmo criterio dos cartoes: sem tarifa carregada a escolha segue
  // liberada; quem recusa e o servidor, na hora do lancamento.
  const porKgBlocked = rates != null && rates.por_kg?.ready === false
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[92px] shrink-0 items-baseline gap-3.5 border-b border-rule px-11">
        <p className="m-0 text-[26px] font-semibold tracking-[-0.02em]">
          Comanda <span className="font-mono font-bold">#{comandaLabel}</span>
        </p>
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-teal">
          {trocando ? 'trocando modalidade' : 'aberta'}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-[38px] px-16">
        <p className="text-2xl text-ink-soft">Como o cliente vai pagar?</p>

        {/* Duas colunas separadas por um fio de 1px, como no desenho: as
            opções são irmãs, não cartões soltos. A régua colorida no topo é
            o que distingue uma da outra — não há ícone. */}
        <div className="flex w-full max-w-[760px] flex-col gap-2.5">
        <div
          className="grid w-full gap-px overflow-hidden rounded-[4px] border border-rule bg-rule"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          {MODE_OPTIONS.map((opt) => {
            const rate = rates?.[opt.mode]
            // Sem tarifas carregadas ainda, a escolha segue liberada — quem
            // recusa modalidade sem produto é o lançamento, no servidor.
            const blocked = rates != null && rate?.ready === false
            const teal = opt.tone === 'teal'
            const price = teal
              ? rate?.price != null
                ? formatCurrency(rate.price)
                : null
              : rate?.price_per_kg != null
                ? `${formatCurrency(rate.price_per_kg)}/kg`
                : null
            const detail = blocked
              ? 'Sem produto cadastrado'
              : teal
                ? 'Quanto comer quiser, uma pessoa'
                : 'Pesa o prato na balança'

            return (
              <button
                key={opt.mode}
                onClick={() => onPick(opt.mode)}
                disabled={busy || blocked}
                className={
                  'flex flex-col items-start gap-3 border-t-[3px] bg-card px-[30px] pb-[26px] pt-7 text-left ' +
                  (teal ? 'border-teal' : 'border-amber') +
                  (blocked || busy ? ' cursor-not-allowed opacity-40' : '')
                }
              >
                <span className="flex w-full items-baseline gap-3">
                  <span
                    className={
                      'text-xs font-bold uppercase tracking-[0.12em] ' +
                      (teal ? 'text-teal' : 'text-amber')
                    }
                  >
                    {opt.title}
                  </span>
                </span>
                <span className="font-mono text-[48px] font-bold leading-none tracking-[-0.04em]">
                  {price ?? '—'}
                </span>
                <span className="text-[15px] leading-[1.4] text-ink-muted">
                  {detail}
                </span>
              </button>
            )
          })}
        </div>

        {/* A balanca ainda nao conversa com a estacao, entao o peso entra
            digitado. O campo mora ja no seletor e o teclado abre sozinho na
            comanda nova: confirmar o peso decide a modalidade — abaixo do
            ponto entra por quilo com o prato lancado, acima vira a vontade. */}
        <button
          onClick={onOpenKeypad}
          disabled={busy || porKgBlocked}
          className="flex min-h-[64px] w-full items-center gap-4 rounded-[4px] border border-rule-strong bg-card px-[30px] text-left disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-amber">
            Peso do prato
          </span>
          <span className="font-mono text-[22px] font-bold leading-none text-ink-muted">
            — g
          </span>
          <span className="flex-1" />
          <span className="text-[15px] text-ink-muted">
            Toque para digitar · o peso decide a modalidade
          </span>
        </button>
        </div>

        <p className="m-0 min-h-[21px] text-[15px] text-ink-muted">
          {breakEvenHint(rates) ?? 'Toque na opção'}
        </p>
      </div>

      <input
        ref={inputRef}
        autoFocus
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={onInputKeyDown}
        inputMode="none"
        className="absolute h-0 w-0 opacity-0"
        aria-label="Modalidade"
      />
    </div>
  )
}

/* ---------------------------------------------------------------- */

function WeightGuard({
  grams,
  threshold,
  onCorrigir,
  onAceitar,
}: {
  grams: number
  threshold: number
  onCorrigir: () => void
  onAceitar: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Peso fora do normal"
      className="absolute inset-0 z-40 flex items-center justify-center px-16"
      style={{ background: 'var(--scrim)' }}
    >
      <div className="w-full max-w-[620px] rounded-[4px] border-t-4 border-amber bg-card-2 px-11 pb-9 pt-10 text-center">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-amber">
          Peso fora do normal
        </span>
        <p className="mt-[18px] font-mono text-[84px] font-bold leading-[0.92] tracking-[-0.05em] text-amber">
          {grams.toLocaleString('pt-BR')} g
        </p>
        <p className="mt-4 text-[21px] font-semibold">
          Isso é <span className="font-mono">{formatWeightProse(grams)}</span> — o
          normal vai até {formatWeightProse(threshold)}.
        </p>
        <p className="mb-[30px] mt-2.5 text-[17px] leading-[1.45] text-ink-soft">
          Confira se há mais de um prato na balança, ou algo apoiado nela.
        </p>
        <div className="flex justify-center gap-3">
          {/* Sem balança conectada não há o que repesar: o conserto é apagar
              e digitar de novo. */}
          <button
            onClick={onCorrigir}
            className="min-h-[60px] rounded-[4px] border border-rule-strong px-7 text-[17px] font-semibold text-ink"
          >
            Corrigir
          </button>
          <button
            onClick={onAceitar}
            className="min-h-[60px] rounded-[4px] bg-amber px-7 text-[17px] font-bold text-on-amber"
          >
            Lançar assim mesmo
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- */

/**
 * Confirmacao do cancelamento tocado na comanda.
 *
 * Um toque escolhe, o segundo confirma — cancelar direto no primeiro toque
 * transformaria qualquer encostada na lista em estorno. O dialogo repete o
 * item por extenso porque e a ultima chance de ver que se tocou na linha
 * errada.
 */
function CancelConfirm({
  target,
  busy,
  onVoltar,
  onConfirmar,
}: {
  target: CancelTarget
  busy: boolean
  onVoltar: () => void
  onConfirmar: () => void
}) {
  const ehItem = target.kind === 'item'
  const nome = ehItem ? target.item.product_name : target.p.nome
  const qty = ehItem
    ? target.item.weight_grams != null
      ? formatWeight(target.item.weight_grams)
      : `${target.item.quantity} un`
    : target.p.qty
  const valor = ehItem ? target.item.total_price : target.p.total
  const decrementa =
    ehItem && target.item.weight_grams == null && target.item.quantity > 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cancelar item"
      className="absolute inset-0 z-40 flex items-center justify-center px-16"
      style={{ background: 'var(--scrim)' }}
      onClick={onVoltar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] rounded-[4px] border-t-4 border-red bg-card-2 px-10 pb-8 pt-8 text-center"
        style={{ animation: 'est-land .18s ease-out' }}
      >
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-red">
          Cancelar item
        </span>
        <p className="mt-4 text-[24px] font-semibold leading-[1.25]">{nome}</p>
        <p className="mt-1.5 font-mono text-[17px] text-ink-soft">
          {qty}
          {valor > 0 ? ` · ${formatCurrency(valor)}` : ''}
        </p>
        <p className="mb-7 mt-3 text-[15px] leading-[1.45] text-ink-muted">
          {!ehItem
            ? 'Este item ainda não subiu — sai da fila sem passar pelo servidor.'
            : decrementa
              ? 'Unitário acima de 1: cancela uma unidade por vez.'
              : 'O item sai da comanda e fica registrado como cancelado.'}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={onVoltar}
            className="min-h-[56px] rounded-[4px] border border-rule-strong px-7 text-[17px] font-semibold text-ink"
          >
            Voltar
          </button>
          <button
            onClick={onConfirmar}
            disabled={busy}
            className="min-h-[56px] rounded-[4px] border border-red bg-red-soft px-7 text-[17px] font-bold text-red disabled:opacity-40"
          >
            Cancelar item
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- */

function CancelSheet({
  items,
  busy,
  onCancelItem,
  onClose,
}: {
  items: StationItem[]
  busy: boolean
  onCancelItem: (itemId: string) => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end"
      style={{ background: 'var(--scrim-soft)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[660px] flex-col border-t-4 border-red bg-card-2"
      >
        <div className="flex shrink-0 items-center gap-5 border-b border-rule px-11 py-[26px]">
          <div className="min-w-0">
            <p className="m-0 text-xs font-bold uppercase tracking-[0.1em] text-red">
              Modo cancelamento · cartão do caixa
            </p>
            <p className="mt-1.5 text-[19px] text-ink-soft">
              Toque no item para cancelar. Unitário acima de 1 decrementa.
            </p>
          </div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="min-h-[52px] shrink-0 rounded-[4px] border border-rule-strong px-5 text-base font-semibold text-ink-soft"
          >
            Sair do modo
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-11 pb-7 pt-2">
          {items.length === 0 ? (
            <p className="py-12 text-center text-[17px] text-ink-muted">
              Comanda vazia — nada para cancelar
            </p>
          ) : (
            items.map((item) => {
              const isWeight = item.weight_grams != null
              return (
                <button
                  key={item.id}
                  disabled={busy}
                  onClick={() => onCancelItem(item.id)}
                  className="-mx-3 grid w-[calc(100%+1.5rem)] grid-cols-[112px_minmax(0,1fr)_auto] items-baseline gap-[22px] border-b border-rule-faint px-3 py-[17px] text-left hover:bg-red-soft disabled:opacity-50"
                >
                  <span className="text-right font-mono text-lg font-bold text-ink-muted">
                    {isWeight ? formatWeight(item.weight_grams) : `${item.quantity} un`}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[19px] font-medium">
                      {item.product_name}
                    </span>
                    <span className="mt-[3px] block font-mono text-[13.5px] text-ink-muted">
                      {isWeight
                        ? `${formatCurrency(item.unit_price)}/kg`
                        : `${formatCurrency(item.unit_price)} cada`}
                    </span>
                  </span>
                  <span className="font-mono text-[22px] font-bold tracking-[-0.01em]">
                    {formatCurrency(item.total_price)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- */

function Toasts({ toasts, inset }: { toasts: Toast[]; inset: boolean }) {
  if (toasts.length === 0) return null
  return (
    <div
      className="pointer-events-none absolute bottom-[22px] left-0 z-50 flex flex-col items-center gap-2"
      // Centraliza na coluna de itens, não na tela: com a comanda aberta o
      // trilho da direita ocupa 420px e o aviso ficaria torto sobre ele. O
      // desconto de 493 é o do desenho — um pouco além da largura do trilho,
      // o que puxa o aviso pra esquerda do centro exato da coluna.
      style={{ width: inset ? 'calc(100% - 493px)' : '100%' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={
            'flex items-center gap-3 rounded-[4px] border-l-[3px] px-[22px] py-3.5 ' +
            (t.kind === 'ok'
              ? 'border-teal-edge bg-teal-soft text-teal'
              : 'border-red bg-red-soft text-red')
          }
          style={{ animation: 'est-land .18s ease-out' }}
        >
          <span className="whitespace-nowrap text-[17px] font-semibold">
            {t.text}
          </span>
        </div>
      ))}
    </div>
  )
}
