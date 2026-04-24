import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { ComandaCard, ServiceMode } from '@txoko/shared'

export const dynamic = 'force-dynamic'

type SearchParams = {
  mode?: string
  status?: string
  kind?: string
}

export default async function EstacaoImprimirPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const filterKind = sp.kind === 'cancel' ? 'cancel' : 'customer'
  const filterMode = (sp.mode === 'avontade' || sp.mode === 'por_kg' ? sp.mode : 'all') as
    | ServiceMode
    | 'all'
  const filterStatus = (sp.status === 'active' || sp.status === 'inactive' || sp.status === 'all'
    ? sp.status
    : 'active') as 'active' | 'inactive' | 'all'

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  let query = supabase
    .from('comanda_cards')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('card_kind', filterKind)
    .order('card_number', { ascending: true })

  if (filterKind === 'customer' && filterMode !== 'all') query = query.eq('service_mode', filterMode)
  if (filterStatus === 'active') query = query.eq('is_active', true)
  else if (filterStatus === 'inactive') query = query.eq('is_active', false)

  const { data } = await query
  const cards = (data ?? []) as unknown as ComandaCard[]

  // Busca nome do restaurante para rodape
  const { data: restRaw } = await supabase
    .from('restaurants')
    .select('name')
    .eq('id', restaurantId)
    .single()
  const restaurantName = (restRaw as { name?: string } | null)?.name ?? 'Txoko'

  const cardsWithQr = await Promise.all(
    cards.map(async (c) => ({
      ...c,
      qrSvg: await QRCode.toString(c.qr_token, {
        type: 'svg',
        margin: 0,
        width: 120,
        errorCorrectionLevel: 'M',
      }),
    })),
  )

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        html, body { background: white; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', system-ui, sans-serif; color: #1A1A1A; }
        .sheet {
          display: grid;
          grid-template-columns: repeat(5, 54mm);
          grid-template-rows: repeat(2, 86mm);
          gap: 2mm;
          justify-content: center;
          align-content: center;
          page-break-after: always;
        }
        .sheet:last-child { page-break-after: auto; }
        .card {
          width: 54mm; height: 86mm;
          border: 0.15mm dashed #ccc;
          padding: 4mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          break-inside: avoid;
        }
        .card-header { width: 100%; text-align: center; }
        .card-mode {
          font-size: 8pt;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #1A1A1A;
        }
        .card.cancel { border-color: #EF4444; border-style: solid; border-width: 0.3mm; }
        .card.cancel .card-mode { color: #EF4444; font-size: 9pt; }
        .card.cancel .card-number { color: #EF4444; }
        .card-rest { font-size: 6pt; color: #78716C; margin-top: 0.5mm; }
        .card-qr { width: 32mm; height: 32mm; display: flex; align-items: center; justify-content: center; }
        .card-qr svg { width: 100%; height: 100%; }
        .card-number {
          font-size: 16pt;
          font-weight: 700;
          font-family: 'Space Mono', ui-monospace, monospace;
          letter-spacing: 0.05em;
        }
        .card-footer { font-size: 5pt; color: #78716C; text-align: center; width: 100%; }
        .toolbar {
          padding: 12mm 8mm;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .toolbar button {
          padding: 8px 16px;
          background: #1A1A1A;
          color: white;
          border: 0;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
        @media print { .toolbar { display: none; } }
      `}</style>

      <div className="toolbar">
        <p style={{ marginBottom: 8, fontSize: 14 }}>
          <strong>{cards.length}</strong> cartoes prontos pra impressao
          <span style={{ color: '#78716C' }}> — {restaurantName}</span>
        </p>
        <button onClick={undefined} id="print-btn">Imprimir (ou Ctrl+P)</button>
        <script dangerouslySetInnerHTML={{ __html: `document.getElementById('print-btn').addEventListener('click', () => window.print())` }} />
      </div>

      {chunk(cardsWithQr, 10).map((page, idx) => (
        <div key={idx} className="sheet">
          {page.map((c) => {
            const isCancel = c.card_kind === 'cancel'
            return (
              <div key={c.id} className={'card' + (isCancel ? ' cancel' : '')}>
                <div className="card-header">
                  <div className="card-mode">
                    {isCancel
                      ? 'CANCELAMENTO — CAIXA'
                      : c.service_mode === 'avontade'
                      ? 'A VONTADE'
                      : 'POR QUILO'}
                  </div>
                  <div className="card-rest">{restaurantName}</div>
                </div>
                <div className="card-qr" dangerouslySetInnerHTML={{ __html: c.qrSvg }} />
                <div className="card-number">
                  #{String(c.card_number).padStart(3, '0')}
                </div>
                <div className="card-footer">
                  {isCancel ? 'Uso exclusivo do operador de caixa' : 'Escaneie no tablet da estacao'}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
