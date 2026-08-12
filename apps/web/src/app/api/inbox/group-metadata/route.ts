/**
 * GET /api/inbox/group-metadata?channelId=...&groupId=...
 *
 * Busca metadados de um grupo WhatsApp via Z-API do canal informado.
 * Requer usuario autenticado; canal precisa ser whatsapp_zapi ativo.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ZapiClient } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const channelId = url.searchParams.get('channelId')
  const groupId = url.searchParams.get('groupId')
  if (!channelId || !groupId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  const { data: channel } = await supabase
    .from('channels')
    .select('id, type, config, status')
    .eq('id', channelId)
    .maybeSingle()

  if (!channel || channel.type !== 'whatsapp_zapi' || channel.status !== 'active') {
    return NextResponse.json({ error: 'channel unavailable' }, { status: 400 })
  }

  const config = (channel.config ?? {}) as Partial<ZapiChannelConfig>
  if (!config.instance_id || !config.token) {
    return NextResponse.json({ error: 'channel not configured' }, { status: 400 })
  }

  try {
    const client = new ZapiClient(config as ZapiChannelConfig)
    const metadata = await client.getGroupMetadata(groupId)
    return NextResponse.json(metadata)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'erro Z-API' },
      { status: 500 }
    )
  }
}
