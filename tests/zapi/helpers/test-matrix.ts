// ---------------------------------------------------------------------------
// Test matrix generator — produces EXACTLY 1000 deterministic test cases
//
// Distribution:
//   text             80
//   image           100
//   video            50
//   ptv              30
//   audio            40
//   ptt              20
//   document         30
//   gif              20
//   sticker          20
//   location         15
//   contact          15
//   button_actions   80
//   button_list      60
//   button_image     60
//   button_pix       30
//   button_otp       20
//   option_list      40
//   carousel         60
//   reply            60
//   reaction         40
//   delete_for_me    30
//   delete_everyone  30
//   edit             15
//   pin              15
//   forward          15
//   poll             30
//   status           20
//   webhook          60
// ---------------------------------------------------------------------------
//   TOTAL          1000

import type { MessageType, RenderAssertion } from './visual-asserter.js'

export type SkipReason = 'option_list_group' | 'carousel_quality' | 'delete_window_exceeded'

export type TestCategory =
  | MessageType
  | 'webhook'
  | 'delete_for_me'
  | 'delete_everyone'
  | 'edit'
  | 'pin'
  | 'forward'
  | 'status'

export type TestCase = {
  testId: string
  category: TestCategory
  endpoint: string
  payload: Record<string, unknown>
  renderAssertion: RenderAssertion
  expectedSkipReason?: SkipReason
}

// ---------------------------------------------------------------------------
// Public constants — reusable URLs for payloads
// ---------------------------------------------------------------------------

export const SAMPLE_IMAGE_URL = 'https://picsum.photos/600/400'
export const SAMPLE_IMAGE_SMALL_URL = 'https://picsum.photos/150/150'
export const SAMPLE_IMAGE_LARGE_URL = 'https://picsum.photos/1920/1080'
export const SAMPLE_PDF_URL =
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
export const SAMPLE_AUDIO_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/ogg/gsm.ogg'
export const SAMPLE_VIDEO_URL =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
export const SAMPLE_GIF_URL = 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif'
export const SAMPLE_STICKER_URL = 'https://www.gstatic.com/webp/gallery/1.webp'

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

function padId(n: number, width = 3): string {
  return String(n).padStart(width, '0')
}

function testId(category: string, index: number): string {
  return `${category}.${padId(index)}`
}

// ---------------------------------------------------------------------------
// Category builders
// ---------------------------------------------------------------------------

function pushTextCases(cases: TestCase[], phone: string, count = 80): void {
  const texts = [
    'Olá! Mensagem de teste simples.',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Mensagem com emoji 🍕🎉🔥',
    'Mensagem com *negrito* e _itálico_',
    'Mensagem com link https://txoko.com.br',
    'Mensagem longa: ' + 'a'.repeat(500),
    'Mensagem com caracteres especiais: <>&"\'',
    'Mensagem com quebra\nde linha',
    '1234567890 — só números',
    'MENSAGEM EM MAIÚSCULAS',
  ]
  for (let i = 0; i < count; i++) {
    const text = texts[i % texts.length] ?? texts[0]!
    cases.push({
      testId: testId('text', i + 1),
      category: 'text',
      endpoint: '/send-text',
      payload: { phone, message: text },
      renderAssertion: {
        messageId: '',
        type: 'text',
        expectedText: text.substring(0, 50),
      },
    })
  }
}

function pushImageCases(cases: TestCase[], phone: string, count = 100): void {
  const variants: Array<{ url?: string; caption?: string; note: string }> = [
    { url: SAMPLE_IMAGE_URL, note: 'url-no-caption' },
    { url: SAMPLE_IMAGE_URL, caption: 'Foto do prato especial', note: 'url-with-caption' },
    { url: SAMPLE_IMAGE_SMALL_URL, caption: 'Thumbnail pequena', note: 'small' },
    { url: SAMPLE_IMAGE_LARGE_URL, caption: 'Foto full HD', note: 'large' },
    { url: SAMPLE_IMAGE_URL, caption: '🍔 Hambúrguer artesanal', note: 'emoji-caption' },
    { url: 'https://picsum.photos/600/400.jpg', note: 'jpg-ext' },
    { url: 'https://picsum.photos/600/400.webp', note: 'webp' },
    { url: SAMPLE_IMAGE_URL, caption: 'a'.repeat(200), note: 'long-caption' },
    { url: SAMPLE_IMAGE_URL, note: 'no-caption-repeat-1' },
    { url: SAMPLE_IMAGE_URL, note: 'no-caption-repeat-2' },
  ]
  for (let i = 0; i < count; i++) {
    const v = variants[i % variants.length] ?? variants[0]!
    cases.push({
      testId: testId('image', i + 1),
      category: 'image',
      endpoint: '/send-image',
      payload: { phone, image: v.url!, ...(v.caption ? { caption: v.caption } : {}) },
      renderAssertion: { messageId: '', type: 'image' },
    })
  }
}

function pushVideoCases(cases: TestCase[], phone: string, videoCount = 50, ptvCount = 30): void {
  const total = videoCount + ptvCount
  for (let i = 0; i < total; i++) {
    const isPtv = i >= videoCount
    cases.push({
      testId: testId(isPtv ? 'ptv' : 'video', (isPtv ? i - videoCount : i) + 1),
      category: isPtv ? 'ptv' : 'video',
      endpoint: isPtv ? '/send-ptv' : '/send-video',
      payload: {
        phone,
        ...(isPtv ? { video: SAMPLE_VIDEO_URL } : { video: SAMPLE_VIDEO_URL }),
        ...(!isPtv && i % 3 === 0 ? { caption: `Vídeo de teste ${i + 1}` } : {}),
      },
      renderAssertion: { messageId: '', type: isPtv ? 'ptv' : 'video' },
    })
  }
}

function pushAudioCases(cases: TestCase[], phone: string, audioCount = 40, pttCount = 20): void {
  const total = audioCount + pttCount
  for (let i = 0; i < total; i++) {
    const isPtt = i >= audioCount
    cases.push({
      testId: testId(isPtt ? 'ptt' : 'audio', (isPtt ? i - audioCount : i) + 1),
      category: isPtt ? 'ptt' : 'audio',
      endpoint: '/send-audio',
      payload: {
        phone,
        audio: SAMPLE_AUDIO_URL,
        ...(isPtt ? { ptt: true } : {}),
      },
      renderAssertion: { messageId: '', type: isPtt ? 'ptt' : 'audio' },
    })
  }
}

function pushDocumentCases(cases: TestCase[], phone: string, count = 30): void {
  const docs = [
    { url: SAMPLE_PDF_URL, name: 'cardapio.pdf', endpoint: '/send-document/pdf' },
    { url: 'https://file-examples.com/storage/fe1c84a9c9650a3a69e4e97/2017/02/file-sample_100kB.docx', name: 'relatorio.docx', endpoint: '/send-document/docx' },
    { url: SAMPLE_PDF_URL, name: 'nota-fiscal.pdf', endpoint: '/send-document/pdf' },
  ]
  for (let i = 0; i < count; i++) {
    const d = docs[i % docs.length] ?? docs[0]!
    cases.push({
      testId: testId('document', i + 1),
      category: 'document',
      endpoint: d.endpoint,
      payload: { phone, document: d.url, fileName: d.name },
      renderAssertion: { messageId: '', type: 'document' },
    })
  }
}

function pushGifCases(cases: TestCase[], phone: string, count = 20): void {
  for (let i = 0; i < count; i++) {
    cases.push({
      testId: testId('gif', i + 1),
      category: 'gif',
      endpoint: '/send-gif',
      payload: {
        phone,
        gif: SAMPLE_GIF_URL,
        ...(i % 2 === 0 ? { caption: `GIF animado ${i + 1}` } : {}),
      },
      renderAssertion: { messageId: '', type: 'gif' },
    })
  }
}

function pushStickerCases(cases: TestCase[], phone: string, count = 20): void {
  for (let i = 0; i < count; i++) {
    cases.push({
      testId: testId('sticker', i + 1),
      category: 'sticker',
      endpoint: '/send-sticker',
      payload: { phone, sticker: SAMPLE_STICKER_URL },
      renderAssertion: { messageId: '', type: 'sticker' },
    })
  }
}

function pushLocationCases(cases: TestCase[], phone: string, count = 15): void {
  const locations = [
    { lat: -23.5505, lng: -46.6333, address: 'Av. Paulista, São Paulo', name: 'Txoko Paulista' },
    { lat: -22.9068, lng: -43.1729, address: 'Copacabana, Rio de Janeiro', name: 'Txoko Rio' },
    { lat: -19.9191, lng: -43.9386, address: 'Centro, Belo Horizonte', name: 'Txoko BH' },
  ]
  for (let i = 0; i < count; i++) {
    const loc = locations[i % locations.length] ?? locations[0]!
    cases.push({
      testId: testId('location', i + 1),
      category: 'location',
      endpoint: '/send-location',
      payload: { phone, ...loc },
      renderAssertion: { messageId: '', type: 'location' },
    })
  }
}

function pushContactCases(cases: TestCase[], phone: string, count = 15): void {
  const contacts = [
    { contactName: 'João Restaurante', contactPhone: '5511999990001' },
    { contactName: 'Maria Chef', contactPhone: '5521999990002' },
    { contactName: 'Delivery Txoko', contactPhone: '5531999990003' },
  ]
  for (let i = 0; i < count; i++) {
    const c = contacts[i % contacts.length] ?? contacts[0]!
    cases.push({
      testId: testId('contact', i + 1),
      category: 'contact',
      endpoint: '/send-contact',
      payload: { phone, ...c },
      renderAssertion: { messageId: '', type: 'contact' },
    })
  }
}

function pushButtonActionsCases(cases: TestCase[], phone: string, count = 80): void {
  const variants = [
    { buttons: [{ label: 'Confirmar', id: 'confirm' }], message: 'Sua reserva está pronta!' },
    { buttons: [{ label: 'Sim' }, { label: 'Não' }], message: 'Deseja confirmar o pedido?' },
    { buttons: [{ label: 'Ver cardápio' }, { label: 'Falar com atendente' }, { label: 'Cancelar' }], message: 'Como posso ajudar?' },
    { buttons: [{ label: '👍 Curtir' }, { label: '👎 Não curtir' }], message: 'Avalie nossa comida', footer: 'Obrigado!' },
    { buttons: [{ label: 'Opção 1' }, { label: 'Opção 2' }], message: 'Selecione uma opção', title: 'Menu' },
  ]
  for (let i = 0; i < count; i++) {
    const v = variants[i % variants.length] ?? variants[0]!
    cases.push({
      testId: testId('button_actions', i + 1),
      category: 'button_actions',
      endpoint: '/send-button-actions',
      payload: { phone, ...v },
      renderAssertion: {
        messageId: '',
        type: 'button_actions',
        expectedButtons: v.buttons.map((b) => b.label),
      },
    })
  }
}

function pushButtonListCases(cases: TestCase[], phone: string, count = 60): void {
  const buildSections = (n: number) =>
    Array.from({ length: n }, (_, si) => ({
      title: `Seção ${si + 1}`,
      rows: Array.from({ length: 3 }, (__, ri) => ({
        title: `Item ${si + 1}.${ri + 1}`,
        description: `Descrição do item ${si + 1}.${ri + 1}`,
        rowId: `row-${si}-${ri}`,
      })),
    }))

  for (let i = 0; i < count; i++) {
    const sectionCount = (i % 3) + 1
    cases.push({
      testId: testId('button_list', i + 1),
      category: 'button_list',
      endpoint: '/send-button-list',
      payload: {
        phone,
        message: `Lista com ${sectionCount} seção(ões)`,
        buttonLabel: 'Ver opções',
        sections: buildSections(sectionCount),
        ...(i % 4 === 0 ? { title: 'Cardápio', footer: 'Txoko' } : {}),
      },
      renderAssertion: { messageId: '', type: 'button_list' },
    })
  }
}

function pushButtonImageCases(cases: TestCase[], phone: string, count = 60): void {
  const variants = [
    { buttons: [{ label: 'Pedir agora', id: 'order' }], caption: 'Prato do dia' },
    { buttons: [{ label: 'Ver detalhes' }, { label: 'Adicionar ao carrinho' }], caption: 'Oferta especial' },
    { buttons: [{ label: 'Comprar' }, { label: 'Salvar' }, { label: 'Compartilhar' }], caption: 'Produto em destaque' },
  ]
  for (let i = 0; i < count; i++) {
    const v = variants[i % variants.length] ?? variants[0]!
    cases.push({
      testId: testId('button_image', i + 1),
      category: 'button_image',
      endpoint: '/send-button-actions',
      payload: { phone, image: SAMPLE_IMAGE_URL, message: v.caption, ...v },
      renderAssertion: {
        messageId: '',
        type: 'button_image',
        expectedButtons: v.buttons.map((b) => b.label),
      },
    })
  }
}

function pushButtonPixCases(cases: TestCase[], phone: string, count = 30): void {
  for (let i = 0; i < count; i++) {
    const value = (i + 1) * 10
    cases.push({
      testId: testId('button_pix', i + 1),
      category: 'button_pix',
      endpoint: '/send-pix',
      payload: {
        phone,
        message: `Pague R$${value},00 via Pix`,
        pixKey: 'txoko@restaurante.com',
        name: 'Txoko Restaurante',
        value,
      },
      renderAssertion: { messageId: '', type: 'button_pix' },
    })
  }
}

function pushButtonOtpCases(cases: TestCase[], phone: string, count = 20): void {
  for (let i = 0; i < count; i++) {
    const otp = String(100000 + i).padStart(6, '0')
    cases.push({
      testId: testId('button_otp', i + 1),
      category: 'button_otp',
      endpoint: '/send-otp',
      payload: { phone, otp },
      renderAssertion: { messageId: '', type: 'button_otp' },
    })
  }
}

function pushOptionListCases(cases: TestCase[], phone: string, count = 40): void {
  const buildRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      title: `Opção ${i + 1}`,
      description: `Desc da opção ${i + 1}`,
      rowId: `opt-${i}`,
    }))

  for (let i = 0; i < count; i++) {
    const rowCount = (i % 5) + 2
    // option_list is blocked in group chats — first 5 flagged as potential skip
    const isGroupVariant = i < 5
    cases.push({
      testId: testId('option_list', i + 1),
      category: 'option_list',
      endpoint: '/send-option-list',
      payload: {
        phone,
        message: `Escolha uma opção (${rowCount} rows)`,
        buttonLabel: 'Abrir lista',
        sections: [{ title: 'Opções disponíveis', rows: buildRows(rowCount) }],
      },
      renderAssertion: { messageId: '', type: 'option_list' },
      ...(isGroupVariant ? { expectedSkipReason: 'option_list_group' as SkipReason } : {}),
    })
  }
}

function pushCarouselCases(cases: TestCase[], phone: string, count = 60): void {
  const cardCounts = [2, 5, 10]
  const buttonTypes: Array<'REPLY' | 'URL'> = ['REPLY', 'URL']

  for (let i = 0; i < count; i++) {
    const numCards = cardCounts[i % cardCounts.length] ?? 2
    const btnType = buttonTypes[Math.floor(i / cardCounts.length) % buttonTypes.length] ?? 'REPLY'

    const cards = Array.from({ length: numCards }, (_, ci) => ({
      image: `https://picsum.photos/400/300?random=${i * 10 + ci}`,
      title: `Card ${ci + 1} — Prato especial`,
      description: `Descrição deliciosa do item ${ci + 1}`,
      buttons: [
        btnType === 'URL'
          ? { label: 'Ver mais', type: 'URL' as const, url: 'https://txoko.com.br/cardapio' }
          : { label: 'Pedir agora', type: 'REPLY' as const, id: `order-${ci}` },
      ],
    }))

    // Mark 10-card carousels as potentially low quality
    const isLargeCarousel = numCards === 10
    cases.push({
      testId: testId('carousel', i + 1),
      category: 'carousel',
      endpoint: '/send-carousel',
      payload: {
        phone,
        message: `Confira nosso cardápio (${numCards} itens)`,
        cards,
      },
      renderAssertion: {
        messageId: '',
        type: 'carousel',
        expectedCarouselCards: numCards,
      },
      ...(isLargeCarousel && i > 50 ? { expectedSkipReason: 'carousel_quality' as SkipReason } : {}),
    })
  }
}

function pushReplyCases(cases: TestCase[], phone: string, count = 60): void {
  const replyToTypes: MessageType[] = ['text', 'image', 'audio', 'button_actions']
  for (let i = 0; i < count; i++) {
    const replyToType = replyToTypes[i % replyToTypes.length] ?? 'text'
    cases.push({
      testId: testId('reply', i + 1),
      category: 'reply',
      endpoint: '/send-text',
      payload: {
        phone,
        messageId: '{{PLACEHOLDER_MESSAGE_ID}}',  // replaced at runtime
        message: `Resposta de teste ${i + 1} para mensagem de tipo ${replyToType}`,
      },
      renderAssertion: {
        messageId: '',
        type: 'reply',
        expectedText: `Resposta de teste ${i + 1}`,
      },
    })
  }
}

function pushReactionCases(cases: TestCase[], phone: string, count = 30): void {
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉']
  for (let i = 0; i < count; i++) {
    const isRemove = i >= count - 5  // last 5 are remove-reaction tests
    const emoji = isRemove ? '' : (emojis[i % emojis.length] ?? '👍')
    cases.push({
      testId: testId('reaction', i + 1),
      category: 'reaction',
      endpoint: '/send-reaction',
      payload: {
        phone,
        messageId: '{{PLACEHOLDER_MESSAGE_ID}}',
        reaction: emoji,
      },
      renderAssertion: {
        messageId: '',
        type: 'reaction',
        ...(emoji ? { expectedReaction: emoji } : {}),
      },
    })
  }
}

function pushDeleteForMeCases(cases: TestCase[], phone: string, count = 30): void {
  for (let i = 0; i < count; i++) {
    cases.push({
      testId: testId('delete_for_me', i + 1),
      category: 'delete_for_me',
      endpoint: '/delete-message',
      payload: {
        phone,
        messageId: '{{PLACEHOLDER_MESSAGE_ID}}',
        owner: 'me',
      },
      renderAssertion: { messageId: '', type: 'deleted_me' },
    })
  }
}

function pushDeleteEveryoneCases(cases: TestCase[], phone: string, count = 30): void {
  for (let i = 0; i < count; i++) {
    const isExpired = i >= count - 5  // last 5 simulate expired window
    cases.push({
      testId: testId('delete_everyone', i + 1),
      category: 'delete_everyone',
      endpoint: '/delete-message',
      payload: {
        phone,
        messageId: '{{PLACEHOLDER_MESSAGE_ID}}',
        owner: 'all',
      },
      renderAssertion: { messageId: '', type: 'deleted_everyone' },
      ...(isExpired ? { expectedSkipReason: 'delete_window_exceeded' as SkipReason } : {}),
    })
  }
}

function pushEditCases(cases: TestCase[], phone: string, count = 15): void {
  for (let i = 0; i < count; i++) {
    cases.push({
      testId: testId('edit', i + 1),
      category: 'edit',
      endpoint: '/update-message',
      payload: {
        phone,
        messageId: '{{PLACEHOLDER_MESSAGE_ID}}',
        message: `Mensagem editada #${i + 1} — versão corrigida`,
      },
      renderAssertion: {
        messageId: '',
        type: 'edited',
      },
    })
  }
}

function pushPinCases(cases: TestCase[], phone: string, count = 15): void {
  for (let i = 0; i < count; i++) {
    const isUnpin = i % 2 === 1
    cases.push({
      testId: testId(isUnpin ? 'unpin' : 'pin', Math.floor(i / 2) + 1),
      category: 'pin',
      endpoint: isUnpin ? '/unpin-message' : '/pin-message',
      payload: {
        phone,
        messageId: '{{PLACEHOLDER_MESSAGE_ID}}',
      },
      renderAssertion: { messageId: '', type: 'text' },
    })
  }
}

function pushForwardCases(cases: TestCase[], phone: string, count = 15): void {
  for (let i = 0; i < count; i++) {
    cases.push({
      testId: testId('forward', i + 1),
      category: 'forward',
      endpoint: '/forward-message',
      payload: {
        phone,
        messageId: '{{PLACEHOLDER_MESSAGE_ID}}',
        targetPhone: phone,
      },
      renderAssertion: { messageId: '', type: 'forward' },
    })
  }
}

function pushPollCases(cases: TestCase[], phone: string, count = 30): void {
  const pollSets = [
    { name: 'Seu prato favorito?', options: ['Pizza', 'Hambúrguer', 'Sushi'], selectableCount: 1 },
    { name: 'Qual horário prefere?', options: ['12h', '13h', '14h', '15h'], selectableCount: 1 },
    { name: 'O que gostaria no cardápio?', options: ['Vegetariano', 'Vegano', 'Sem glúten', 'Low carb', 'Keto'], selectableCount: 3 },
  ]
  for (let i = 0; i < count; i++) {
    const p = pollSets[i % pollSets.length] ?? pollSets[0]!
    cases.push({
      testId: testId('poll', i + 1),
      category: 'poll',
      endpoint: '/send-poll',
      payload: { phone, ...p },
      renderAssertion: {
        messageId: '',
        type: 'poll',
        expectedPollOptions: p.options,
      },
    })
  }
}

function pushStatusCases(cases: TestCase[], phone: string, count = 20): void {
  const types: Array<'text' | 'image' | 'video'> = ['text', 'image', 'video']
  for (let i = 0; i < count; i++) {
    const type = types[i % types.length] ?? 'text'
    cases.push({
      testId: testId('status', i + 1),
      category: 'status',
      endpoint: '/send-status',
      payload: {
        phone,
        type,
        content:
          type === 'text'
            ? `Status de texto ${i + 1} 🍽️`
            : type === 'image'
            ? SAMPLE_IMAGE_URL
            : SAMPLE_VIDEO_URL,
        ...(type !== 'text' ? { caption: `Status ${i + 1}` } : {}),
      },
      renderAssertion: { messageId: '', type: 'text' },  // status doesn't render in inbox
    })
  }
}

function pushWebhookCases(cases: TestCase[], phone: string, count = 60): void {
  const eventTypes = [
    'on-message-send',
    'on-message-received',
    'on-message-status',
    'on-message-delete',
    'on-presence-chat',
  ]
  for (let i = 0; i < count; i++) {
    const eventType = eventTypes[i % eventTypes.length] ?? 'on-message-send'
    cases.push({
      testId: testId('webhook', i + 1),
      category: 'webhook',
      endpoint: '/send-text',  // trigger message to generate webhook
      payload: {
        phone,
        message: `Webhook validation test ${i + 1} — expecting ${eventType}`,
      },
      renderAssertion: { messageId: '', type: 'text' },
    })
  }
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateTestMatrix(phone = '{{TEST_TARGET_PHONE}}'): TestCase[] {
  const cases: TestCase[] = []

  // Distribution summing to EXACTLY 1000:
  pushTextCases(cases, phone, 90)           //  90
  pushImageCases(cases, phone, 100)         // 100
  pushVideoCases(cases, phone, 35, 20)      //  55  (video=35, ptv=20)
  pushAudioCases(cases, phone, 35, 15)      //  50  (audio=35, ptt=15)
  pushDocumentCases(cases, phone, 20)       //  20
  pushGifCases(cases, phone, 15)            //  15
  pushStickerCases(cases, phone, 15)        //  15
  pushLocationCases(cases, phone, 10)       //  10
  pushContactCases(cases, phone, 10)        //  10
  pushButtonActionsCases(cases, phone, 80)  //  80
  pushButtonListCases(cases, phone, 60)     //  60
  pushButtonImageCases(cases, phone, 60)    //  60
  pushButtonPixCases(cases, phone, 30)      //  30
  pushButtonOtpCases(cases, phone, 20)      //  20
  pushOptionListCases(cases, phone, 40)     //  40
  pushCarouselCases(cases, phone, 60)       //  60
  pushReplyCases(cases, phone, 60)          //  60
  pushReactionCases(cases, phone, 30)       //  30
  pushDeleteForMeCases(cases, phone, 25)    //  25
  pushDeleteEveryoneCases(cases, phone, 25) //  25
  pushEditCases(cases, phone, 15)           //  15
  pushPinCases(cases, phone, 15)            //  15
  pushForwardCases(cases, phone, 15)        //  15
  pushPollCases(cases, phone, 25)           //  25
  pushStatusCases(cases, phone, 15)         //  15
  pushWebhookCases(cases, phone, 60)        //  60
  // ─────────────────────────────────────────────
  //                               TOTAL = 1000

  // Verify exact count
  if (cases.length !== 1000) {
    throw new Error(
      `[test-matrix] Expected exactly 1000 cases, got ${cases.length}. Fix the distribution.`,
    )
  }

  return cases
}

// Coverage summary for documentation — must match generateTestMatrix() calls above
export const MATRIX_DISTRIBUTION: Record<string, number> = {
  text: 90,
  image: 100,
  video: 35,
  ptv: 20,
  audio: 35,
  ptt: 15,
  document: 20,
  gif: 15,
  sticker: 15,
  location: 10,
  contact: 10,
  button_actions: 80,
  button_list: 60,
  button_image: 60,
  button_pix: 30,
  button_otp: 20,
  option_list: 40,
  carousel: 60,
  reply: 60,
  reaction: 30,
  delete_for_me: 25,
  delete_everyone: 25,
  edit: 15,
  pin: 15,
  forward: 15,
  poll: 25,
  status: 15,
  webhook: 60,
  // TOTAL: 1000
}
