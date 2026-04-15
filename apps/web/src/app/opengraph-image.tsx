import { ImageResponse } from 'next/og'

export const alt = 'Txoko — Gestao para Restaurantes'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          padding: 80,
          fontFamily: 'system-ui',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Gradiente decorativo */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            background: 'radial-gradient(circle, rgba(234,29,44,0.12) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -200,
            left: -200,
            width: 600,
            height: 600,
            background: 'radial-gradient(circle, rgba(255,199,0,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 80,
              height: 80,
              background: '#EA1D2C',
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 56,
              fontWeight: 800,
              position: 'relative',
            }}
          >
            T
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#FFC700',
              }}
            />
          </div>
          <span
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: '#0F0F0F',
              letterSpacing: -1,
            }}
          >
            txoko
          </span>
        </div>

        {/* Titulo grande */}
        <div
          style={{
            marginTop: 80,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <span
            style={{
              fontSize: 84,
              fontWeight: 800,
              color: '#0F0F0F',
              letterSpacing: -3,
              lineHeight: 1,
            }}
          >
            Gestao que faz o
          </span>
          <span
            style={{
              fontSize: 84,
              fontWeight: 800,
              color: '#EA1D2C',
              letterSpacing: -3,
              lineHeight: 1,
              fontStyle: 'italic',
            }}
          >
            basico brilhar.
          </span>
        </div>

        {/* Features pills */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: 'auto',
          }}
        >
          {['PDV', 'KDS', 'Estoque', 'Financeiro', 'IA Claude'].map((f) => (
            <div
              key={f}
              style={{
                padding: '12px 24px',
                background: '#F6F6F5',
                border: '1px solid #E8E6E3',
                borderRadius: 999,
                fontSize: 22,
                color: '#4A4744',
                fontWeight: 500,
              }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
