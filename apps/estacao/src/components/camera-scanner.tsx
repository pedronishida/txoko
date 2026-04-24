'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { CameraOff } from 'lucide-react'

type CameraStatus = 'starting' | 'active' | 'denied' | 'no-device' | 'error'

interface BackgroundCameraScannerProps {
  onScan: (raw: string) => void
  /** Se true, render visualmente o preview em um painel pequeno. Default false (headless). */
  preview?: boolean
}

export function BackgroundCameraScanner({ onScan, preview = false }: BackgroundCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let cancelled = false

    async function start() {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (devices.length === 0) {
          setStatus('no-device')
          return
        }
        const back = devices.find((d) => /back|rear|environment/i.test(d.label))
        const deviceId = back?.deviceId ?? devices[devices.length - 1]?.deviceId ?? undefined

        if (cancelled || !videoRef.current) return
        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result) => {
            if (result) onScan(result.getText())
          },
        )
        controlsRef.current = controls
        if (!cancelled) setStatus('active')
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao acessar camera'
        setErrorMsg(msg)
        // NotAllowedError = permissao negada
        if (/NotAllowedError|Permission/i.test(msg)) setStatus('denied')
        else setStatus('error')
      }
    }

    start()
    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [onScan])

  return (
    <>
      {/* Video: escondido (1x1 px) mas renderizado pra manter o stream ativo */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={
          preview
            ? 'fixed top-4 right-4 w-60 aspect-video rounded-xl object-cover z-40 border border-border-strong shadow-lg bg-black'
            : 'fixed top-0 left-0 w-[1px] h-[1px] opacity-0 pointer-events-none'
        }
      />

      {/* Indicador de status — bem discreto */}
      <CameraStatusDot status={status} errorMsg={errorMsg} />
    </>
  )
}

function CameraStatusDot({ status, errorMsg }: { status: CameraStatus; errorMsg: string | null }) {
  // Quando a camera esta funcionando normalmente, nao mostra nada.
  // So aparece se precisar de atencao (iniciando/bloqueada/sem-device/erro).
  if (status === 'active') return null

  const color = status === 'starting' ? 'bg-warm animate-pulse' : 'bg-coral'

  const label =
    status === 'starting'
      ? 'Iniciando camera...'
      : status === 'denied'
      ? 'Camera bloqueada — permita no browser'
      : status === 'no-device'
      ? 'Nenhuma camera encontrada'
      : errorMsg ?? 'Erro na camera'

  return (
    <div
      className="fixed top-4 left-4 z-40 flex items-center gap-2 px-2.5 h-8 rounded-full bg-bg-card border border-border text-xs text-fg-muted"
      title={label}
    >
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <CameraOff size={12} />
      <span>{label}</span>
    </div>
  )
}
