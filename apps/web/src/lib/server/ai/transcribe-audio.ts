// =============================================================
// Transcricao de audio via Groq Whisper large-v3
// =============================================================
// Se GROQ_API_KEY nao estiver configurada, retorna null (graceful degradation)
// =============================================================

export async function transcribeAudio(audioUrl: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const audioResponse = await fetch(audioUrl)
  if (!audioResponse.ok) {
    throw new Error(`Falha ao baixar audio: HTTP ${audioResponse.status}`)
  }
  const audioBlob = await audioResponse.blob()

  const formData = new FormData()
  formData.append('file', audioBlob, 'audio.ogg')
  formData.append('model', 'whisper-large-v3')
  formData.append('language', 'pt')
  formData.append('response_format', 'json')

  const result = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!result.ok) {
    throw new Error(`Groq API error: ${result.status}`)
  }

  const data = (await result.json()) as { text: string }
  return data.text
}
