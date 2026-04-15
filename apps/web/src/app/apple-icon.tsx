import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#EA1D2C',
          borderRadius: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 120,
          fontWeight: 800,
          fontFamily: 'system-ui',
          position: 'relative',
        }}
      >
        T
        <div
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#FFC700',
          }}
        />
      </div>
    ),
    { ...size }
  )
}
