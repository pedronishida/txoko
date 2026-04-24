'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'
import { CameraOff } from 'lucide-react'

type CameraStatus = 'starting' | 'active' | 'denied' | 'no-device' | 'error'

// Limita os formatos pro decoder focar neles (mais preciso e rapido)
const SCAN_HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
])

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
    // 500ms entre tentativas = throttle leve. Formats limitados = mais precisao.
    const reader = new BrowserMultiFormatReader(SCAN_HINTS, { delayBetweenScanAttempts: 150 })
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

        // Pede alta resolucao pro getUserMedia (melhor leitura de 1D).
        // zxing usa decodeFromVideoDevice que aceita deviceId, mas nao constraints.
        // Pra constraints customizados: pegamos stream manualmente e passamos pra decodeFromVideoElement.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
          if (result) onScan(result.getText())
        })
        controlsRef.current = {
          stop: () => {
            controls.stop()
            stream.getTracks().forEach((t) => t.stop())
          },
        }
        if (!cancelled) setStatus('active')
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao acessar camera'
        setErrorMsg(msg)
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
      {/* Video: escondido fora da viewport (nao usa opacity:0 porque alguns
          browsers pausam stream). Posicionado fora da tela mantem o decoder ativo. */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={
          preview
            ? 'fixed top-4 right-4 w-60 aspect-video rounded-xl object-cover z-40 border border-border-strong shadow-lg bg-black'
            : 'fixed w-[120px] h-[90px] pointer-events-none bg-black'
        }
        style={
          preview
            ? undefined
            : { top: '-200px', left: '-200px' }
        }
      />

      {/* Indicador de status — bem discreto */}
      <CameraStatusDot status={status} errorMsg={errorMsg} />
    </>
  )
}

function CameraStatusDot({ status, errorMsg }: { status: CameraStatus; errorMsg: string | null }) {
  // Quando ativa: bolinha verde minuscula (nao atrapalha). Problema: pill completo.
  // Posicionado fora da regiao do sidebar (left >= 240px).
  if (status === 'active') {
    return (
      <div
        className="fixed top-4 right-6 z-40 w-2 h-2 rounded-full bg-success"
        title="Camera ativa"
      />
    )
  }

  const dot = status === 'starting' ? 'bg-warning animate-pulse' : 'bg-destructive'

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
      className="fixed top-4 right-6 z-40 flex items-center gap-2 px-2.5 h-8 rounded-full bg-surface border border-border text-xs text-muted"
      title={label}
    >
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <CameraOff size={12} />
      <span>{label}</span>
    </div>
  )
}
