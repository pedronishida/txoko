'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Download, ExternalLink } from 'lucide-react'
import { updateQrUrl } from './actions'

export function QrConfigView({
  qrTarget,
  qrSvg,
  menuUrl,
  initialUrl,
}: {
  qrTarget: string
  qrSvg: string
  menuUrl: string
  initialUrl: string
}) {
  const [url, setUrl] = useState(initialUrl)
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    setFeedback(null)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await updateQrUrl({ url })
      if (!res.ok) {
        setFeedback('error')
        setErrorMsg(res.error)
        return
      }
      setFeedback('saved')
      setTimeout(() => setFeedback(null), 2500)
    })
  }

  async function copyTarget() {
    await navigator.clipboard.writeText(qrTarget)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Converte o SVG em PNG grande no proprio navegador — Canva e afins nao
  // aceitam SVG em todo lugar, e 1200px imprime bem em cartao.
  function baixarPng() {
    const img = new Image()
    const svg = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svg)
    img.onload = () => {
      const size = 1200
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, size, size)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, size, size)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = 'qr-comanda.png'
      a.click()
    }
    img.src = url
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="text-[15px] font-semibold text-foreground">
          QR da comanda
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          O cartao leva um codigo de barras, que a estacao e o caixa usam pra
          abrir a comanda, e um QR, que e pro cliente escanear no celular.
          Aqui voce escolhe pra onde esse QR leva.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-night p-4 flex flex-col sm:flex-row gap-5">
        {/* Vetor pra grafica: escala sem perder nitidez */}
        <div className="shrink-0 space-y-2">
          <div
            className="w-40 h-40 bg-white rounded-lg p-2 [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="flex gap-1.5">
            <a
              href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`}
              download="qr-comanda.svg"
              className="flex-1 h-8 rounded-md border border-border text-[11px] text-muted hover:text-foreground inline-flex items-center justify-center gap-1"
            >
              <Download size={12} />
              SVG
            </a>
            <button
              onClick={baixarPng}
              className="flex-1 h-8 rounded-md border border-border text-[11px] text-muted hover:text-foreground inline-flex items-center justify-center gap-1"
            >
              <Download size={12} />
              PNG
            </button>
          </div>
          <p className="text-[11px] text-muted text-center">
            SVG pra grafica, PNG pra Canva
          </p>
        </div>

        <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted">
          Endereco que vai no QR impresso
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 font-data text-[13px] text-foreground break-all">
            {qrTarget}
          </code>
          <button
            onClick={copyTarget}
            className="shrink-0 h-9 px-3 rounded-lg border border-border text-[12px] text-muted hover:text-foreground inline-flex items-center gap-1.5"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Esse endereco nunca muda — imprima ele nos cartoes uma vez. Trocar o
          destino abaixo nao exige reimprimir nada.
        </p>
        </div>
      </section>

      <section className="space-y-3">
        <label className="block">
          <span className="block text-[13px] font-medium text-foreground/75 mb-1.5">
            Destino
          </span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={menuUrl}
            className="w-full h-10 px-3.5 bg-night border border-border rounded-lg text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
          />
        </label>

        <p className="text-[12px] text-muted">
          Em branco, o QR abre o cardapio digital
          {' '}
          <a
            href={menuUrl}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline inline-flex items-center gap-1"
          >
            {menuUrl.replace(/^https?:\/\//, '')}
            <ExternalLink size={11} />
          </a>
          . Ou aponte pra onde quiser: promocao, Instagram, pesquisa de
          satisfacao, cardapio de bebidas.
        </p>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={pending}
            className="h-10 px-4 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50"
          >
            {pending ? 'Salvando...' : 'Salvar destino'}
          </button>
          {feedback === 'saved' && (
            <span className="text-[12px] text-success">Destino salvo</span>
          )}
          {feedback === 'error' && (
            <span className="text-[12px] text-destructive">{errorMsg}</span>
          )}
        </div>
      </section>
    </div>
  )
}
