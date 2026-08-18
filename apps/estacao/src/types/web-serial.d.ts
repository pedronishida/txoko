// Tipos minimos da Web Serial API (nao vem no lib.dom padrao do TS).
// Usada pra ler a balanca Toledo Prix IV direto do Chrome, sem instalar nada.

interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialOptions {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

interface SerialPort {
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
}

interface SerialPortRequestOptions {
  filters?: { usbVendorId?: number; usbProductId?: number }[]
}

interface Serial {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}

interface Navigator {
  readonly serial: Serial
}
