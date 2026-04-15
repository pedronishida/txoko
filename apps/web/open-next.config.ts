import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Config minimal — sem R2 incremental cache (nao usamos ISR).
// Pra ativar ISR/cache, seguir: https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig({})
