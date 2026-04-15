import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// Inbox media mirror
// =============================================================
// URLs de midia do Z-API expiram em ~30 dias. Este helper baixa
// os arquivos das URLs externas e sobe para o bucket `inbox-media`
// do Supabase Storage, retornando novos attachments com URLs
// permanentes.
// =============================================================

const BUCKET = 'inbox-media'
const MAX_SIZE = 25 * 1024 * 1024 // 25MB — limite WhatsApp

export type AttachmentInput = {
  type: string
  url?: string
  mimeType?: string
  fileName?: string
  [key: string]: unknown
}

export type AttachmentMirrored = AttachmentInput & {
  url: string
  original_url?: string
  storage_path?: string
  mirrored_at?: string
  mirror_error?: string
}

function extFromMime(mime?: string, fallback = 'bin'): string {
  if (!mime) return fallback
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }
  return map[mime] ?? fallback
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w.\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100)
}

/**
 * Baixa uma URL externa e sobe para o Supabase Storage.
 * Retorna attachment atualizado com url permanente, ou com mirror_error.
 */
async function mirrorOne(
  supabase: SupabaseClient,
  att: AttachmentInput,
  pathPrefix: string,
  index: number
): Promise<AttachmentMirrored> {
  if (!att.url || !/^https?:\/\//.test(att.url)) {
    return att as AttachmentMirrored
  }

  try {
    const res = await fetch(att.url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Txoko/1.0' },
    })
    if (!res.ok) {
      return {
        ...att,
        original_url: att.url,
        mirror_error: `HTTP ${res.status}`,
      } as AttachmentMirrored
    }

    const contentLength = Number(res.headers.get('content-length') ?? 0)
    if (contentLength > MAX_SIZE) {
      return {
        ...att,
        original_url: att.url,
        mirror_error: `arquivo excede ${MAX_SIZE} bytes`,
      } as AttachmentMirrored
    }

    const contentType =
      res.headers.get('content-type') ?? att.mimeType ?? 'application/octet-stream'
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MAX_SIZE) {
      return {
        ...att,
        original_url: att.url,
        mirror_error: `arquivo excede ${MAX_SIZE} bytes (apos download)`,
      } as AttachmentMirrored
    }

    const ext = extFromMime(contentType, extFromMime(att.mimeType))
    const baseName = att.fileName
      ? sanitizeFileName(att.fileName)
      : `${att.type}-${index}.${ext}`
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(baseName)
    const finalName = hasExt ? baseName : `${baseName}.${ext}`
    const storagePath = `${pathPrefix}/${finalName}`

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
        cacheControl: '31536000', // 1 ano
      })

    if (upErr) {
      return {
        ...att,
        original_url: att.url,
        mirror_error: upErr.message,
      } as AttachmentMirrored
    }

    const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

    return {
      ...att,
      original_url: att.url,
      url: publicUrl.publicUrl,
      storage_path: storagePath,
      mirrored_at: new Date().toISOString(),
      mimeType: contentType,
    }
  } catch (e) {
    return {
      ...att,
      original_url: att.url,
      mirror_error: (e as Error).message,
    } as AttachmentMirrored
  }
}

/**
 * Espelha todos os attachments de uma mensagem em paralelo.
 * Atualiza messages.attachments com as URLs novas.
 * Safe para chamar em fire-and-forget: qualquer erro vira `mirror_error`
 * no attachment e nao corrompe a mensagem original.
 */
export async function mirrorMessageAttachments(
  supabase: SupabaseClient,
  input: {
    messageId: string
    restaurantId: string
    conversationId: string
    attachments: AttachmentInput[]
  }
): Promise<{ updated: AttachmentMirrored[] }> {
  if (!Array.isArray(input.attachments) || input.attachments.length === 0) {
    return { updated: [] }
  }

  const pathPrefix = `${input.restaurantId}/${input.conversationId}/${input.messageId}`

  const updated = await Promise.all(
    input.attachments.map((att, i) => mirrorOne(supabase, att, pathPrefix, i))
  )

  // Persiste sempre que o processamento rodou — inclui sucesso e mirror_error.
  // Isso garante visibilidade de falhas no banco e evita estado "limbo".
  const anyTouched = updated.some(
    (a, i) =>
      a.url !== input.attachments[i]?.url ||
      a.mirror_error !== undefined ||
      a.storage_path !== undefined
  )
  if (anyTouched) {
    await supabase
      .from('messages')
      .update({ attachments: updated })
      .eq('id', input.messageId)
  }

  return { updated }
}

/**
 * Espelha a foto de perfil de um contato. As URLs `senderPhoto` do Z-API /
 * WhatsApp expiram em 48h (politica Meta). Este helper baixa a foto e sobe
 * pro bucket `inbox-media` sob `<restaurant>/avatars/<contact>.<ext>`, depois
 * atualiza `contacts.avatar_url` com a URL permanente.
 *
 * Idempotente: se `contacts.avatar_url` ja aponta pro bucket, nao faz nada.
 */
export async function mirrorContactAvatar(
  supabase: SupabaseClient,
  input: {
    contactId: string
    restaurantId: string
    avatarUrl: string | null
  }
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!input.avatarUrl || !/^https?:\/\//.test(input.avatarUrl)) {
    return { ok: false, error: 'no avatar url' }
  }

  // Skip se a avatar_url atual ja eh do nosso storage
  const { data: current } = await supabase
    .from('contacts')
    .select('avatar_url')
    .eq('id', input.contactId)
    .maybeSingle()
  const currentUrl = current?.avatar_url as string | undefined
  if (currentUrl && currentUrl.includes('/storage/v1/object/public/inbox-media/')) {
    return { ok: true, url: currentUrl }
  }

  try {
    const res = await fetch(input.avatarUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Txoko/1.0' },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }

    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MAX_SIZE) {
      return { ok: false, error: `avatar excede ${MAX_SIZE} bytes` }
    }

    const ext = extFromMime(contentType, 'jpg')
    const storagePath = `${input.restaurantId}/avatars/${input.contactId}.${ext}`

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
        cacheControl: '86400', // 1 dia
      })
    if (upErr) return { ok: false, error: upErr.message }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    const permanentUrl = pub.publicUrl

    await supabase
      .from('contacts')
      .update({ avatar_url: permanentUrl })
      .eq('id', input.contactId)

    return { ok: true, url: permanentUrl }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
