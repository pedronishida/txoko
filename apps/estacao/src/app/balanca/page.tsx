'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plug, PlugZap, Send, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'

// Diagnostico da balanca (Toledo Prix IV) via Web Serial.
//
// Cada fabricante tem seu formato de quadro e a Prix IV ainda muda conforme o
// protocolo configurado no menu dela. Em vez de chutar, esta tela mostra os
// bytes crus que chegam — com o peso real no prato, da pra escrever o parser
// certo de primeira.
//
// So funciona em Chrome/Edge de desktop: Web Serial nao existe em Android.

const BAUD_RATES = [9600, 4800, 19200, 2400, 38400]

type Frame = {
  id: number
  at: string
  hex: string
  ascii: string
  bytes: number
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

// Controles viram simbolo pra nao sumir no log
function toAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => {
      if (b === 0x02) return '␂' // STX
      if (b === 0x03) return '␃' // ETX
      if (b === 0x05) return '␅' // ENQ
      if (b === 0x0d) return '␍' // CR
      if (b === 0x0a) return '␊' // LF
      if (b < 0x20 || b > 0x7e) return '·'
      return String.fromCharCode(b)
    })
    .join('')
}

/** Acha qualquer coisa que se pareca com peso, pra ajudar a calibrar. */
function candidatosDePeso(ascii: string): string[] {
  const limpo = ascii.replace(/[^\d.,]/g, ' ')
  const achados = limpo.match(/\d+[.,]?\d*/g) ?? []
  return [...new Set(achados)].slice(0, 6)
}

export default function BalancaPage() {
  const [suportado, setSuportado] = useState<boolean | null>(null)
  const [conectado, setConectado] = useState(false)
  const [baud, setBaud] = useState(9600)
  const [frames, setFrames] = useState<Frame[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [totalBytes, setTotalBytes] = useState(0)

  const portRef = useRef<SerialPort | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const pararRef = useRef(false)
  const idRef = useRef(0)

  useEffect(() => {
    setSuportado(typeof navigator !== 'undefined' && 'serial' in navigator)
  }, [])

  const pushFrame = useCallback((bytes: Uint8Array) => {
    idRef.current += 1
    const frame: Frame = {
      id: idRef.current,
      at: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
      hex: toHex(bytes),
      ascii: toAscii(bytes),
      bytes: bytes.length,
    }
    setFrames((prev) => [frame, ...prev].slice(0, 200))
    setTotalBytes((n) => n + bytes.length)
  }, [])

  async function conectar() {
    setErro(null)
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none' })
      portRef.current = port
      pararRef.current = false
      setConectado(true)
      void lerLoop(port)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao abrir a porta')
    }
  }

  async function lerLoop(port: SerialPort) {
    while (!pararRef.current && port.readable) {
      const reader = port.readable.getReader()
      readerRef.current = reader
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          if (value && value.length > 0) pushFrame(value)
        }
      } catch (e) {
        if (!pararRef.current) {
          setErro(e instanceof Error ? e.message : 'Erro na leitura')
        }
      } finally {
        reader.releaseLock()
        readerRef.current = null
      }
    }
  }

  async function desconectar() {
    pararRef.current = true
    try {
      await readerRef.current?.cancel()
    } catch {
      // reader ja pode ter caido junto com a porta
    }
    try {
      await portRef.current?.close()
    } catch {
      // idem
    }
    portRef.current = null
    setConectado(false)
  }

  /** Varias balancas so respondem quando o PDV pede. ENQ (0x05) e o pedido
   *  classico do protocolo Toledo. */
  async function enviar(bytes: number[]) {
    const port = portRef.current
    if (!port?.writable) {
      setErro('Porta nao esta aberta pra escrita')
      return
    }
    const writer = port.writable.getWriter()
    try {
      await writer.write(new Uint8Array(bytes))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar')
    } finally {
      writer.releaseLock()
    }
  }

  return (
    <main className="min-h-screen bg-bg text-fg p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Diagnostico da balanca</h1>
          <p className="text-fg-muted mt-1">
            Toledo Prix IV via cabo serial. Conecte, ponha um peso conhecido no
            prato e me mande o que aparecer aqui — com isso eu escrevo a leitura
            automatica.
          </p>
        </header>

        {suportado === false && (
          <div className="flex gap-3 p-4 rounded-xl border border-coral/40 bg-coral-soft">
            <AlertCircle size={18} className="text-coral shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-fg">Este navegador nao le porta serial</p>
              <p className="text-fg-muted mt-0.5">
                Web Serial existe so no Chrome ou Edge de computador. Em tablet
                Android ou iPad nao funciona.
              </p>
            </div>
          </div>
        )}

        <section className="rounded-xl border border-border bg-bg-card p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-fg-muted mb-1">
                Velocidade (baud)
              </label>
              <select
                value={baud}
                onChange={(e) => setBaud(Number(e.target.value))}
                disabled={conectado}
                className="h-10 px-3 bg-bg border border-border rounded-lg text-sm disabled:opacity-50"
              >
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {!conectado ? (
              <button
                onClick={conectar}
                disabled={suportado === false}
                className="h-10 px-4 rounded-lg bg-primary text-white font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-40"
              >
                <Plug size={16} />
                Conectar balanca
              </button>
            ) : (
              <button
                onClick={desconectar}
                className="h-10 px-4 rounded-lg border-2 border-coral text-coral font-semibold text-sm inline-flex items-center gap-2"
              >
                <PlugZap size={16} />
                Desconectar
              </button>
            )}

            {conectado && (
              <>
                <button
                  onClick={() => enviar([0x05])}
                  className="h-10 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-2"
                  title="ENQ — pedido classico do protocolo Toledo"
                >
                  <Send size={14} />
                  Enviar ENQ
                </button>
                <button
                  onClick={() => enviar([0x05, 0x0d])}
                  className="h-10 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-2"
                >
                  <Send size={14} />
                  ENQ + CR
                </button>
              </>
            )}

            <div className="flex-1" />

            <button
              onClick={() => {
                setFrames([])
                setTotalBytes(0)
              }}
              className="h-10 px-3 rounded-lg border border-border text-fg-muted text-sm inline-flex items-center gap-2"
            >
              <Trash2 size={14} />
              Limpar
            </button>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2">
              {conectado ? (
                <>
                  <CheckCircle2 size={14} className="text-primary" />
                  <span className="text-fg">Conectada a {baud} baud</span>
                </>
              ) : (
                <span className="text-fg-muted">Desconectada</span>
              )}
            </span>
            <span className="text-fg-muted font-mono">
              {frames.length} quadros · {totalBytes} bytes
            </span>
          </div>

          {erro && <p className="text-coral text-sm">{erro}</p>}
        </section>

        <section className="rounded-xl border border-border bg-bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm">O que a balanca esta mandando</h2>
            <span className="text-xs text-fg-muted">mais recente no topo</span>
          </div>

          {frames.length === 0 ? (
            <p className="p-8 text-center text-fg-muted text-sm">
              {conectado
                ? 'Nada ainda. Ponha um peso no prato — se continuar vazio, tente outra velocidade ou o botao ENQ.'
                : 'Conecte a balanca pra comecar.'}
            </p>
          ) : (
            <ul className="divide-y divide-border max-h-[50vh] overflow-y-auto">
              {frames.map((f) => {
                const pesos = candidatosDePeso(f.ascii)
                return (
                  <li key={f.id} className="px-4 py-2.5 font-mono text-xs space-y-1">
                    <div className="flex items-center gap-3 text-fg-muted">
                      <span>{f.at}</span>
                      <span>{f.bytes}B</span>
                      {pesos.length > 0 && (
                        <span className="text-primary">
                          numeros: {pesos.join('  ')}
                        </span>
                      )}
                    </div>
                    <div className="text-fg break-all">{f.ascii}</div>
                    <div className="text-fg-muted break-all">{f.hex}</div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border p-4 text-sm text-fg-muted space-y-2">
          <p className="text-fg font-semibold">Se nao aparecer nada</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Confira o cabo: a Prix IV usa saida serial DB9 — em PC sem porta serial, precisa de adaptador USB-Serial.</li>
            <li>Troque a velocidade: 9600 e a mais comum, mas 4800 e 19200 aparecem.</li>
            <li>Tente o botao ENQ: algumas configuracoes so respondem quando o PDV pede.</li>
            <li>No menu da balanca, confira o protocolo de comunicacao com PDV.</li>
          </ol>
        </section>
      </div>
    </main>
  )
}
