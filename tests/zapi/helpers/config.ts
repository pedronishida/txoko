import { z } from 'zod'
import 'dotenv/config'

// ---------------------------------------------------------------------------
// Zod-validated environment — fails fast with a clear message on first boot
// ---------------------------------------------------------------------------

const envSchema = z.object({
  ZAPI_INSTANCE_ID: z.string().min(1, 'ZAPI_INSTANCE_ID required'),
  ZAPI_TOKEN: z.string().min(1, 'ZAPI_TOKEN required'),
  ZAPI_CLIENT_TOKEN: z.string().min(1, 'ZAPI_CLIENT_TOKEN required'),
  TEST_TARGET_PHONE: z.string().min(12, 'TEST_TARGET_PHONE must be 55+DDD+number (min 12 chars)'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY required'),
  TXOKO_BASE_URL: z.string().url().default('https://app.txoko.com.br'),
  TXOKO_TEST_USER_EMAIL: z.string().email().optional(),
  TXOKO_TEST_USER_PASSWORD: z.string().optional(),
  WEBHOOK_COLLECTOR_URL: z.string().url('WEBHOOK_COLLECTOR_URL must be a valid URL'),
  MAX_CONCURRENCY: z.coerce.number().int().positive().default(4),
  RATE_LIMIT_MS: z.coerce.number().int().nonnegative().default(1000),
  SKIP_VISUAL: z
    .string()
    .toLowerCase()
    .transform((v) => v === 'true' || v === '1')
    .pipe(z.boolean())
    .default('false'),
})

export type Config = z.infer<typeof envSchema>

// We do a lazy parse so that matrix generation (no network calls) can import
// helpers without crashing when env vars are absent.
let _config: Config | null = null

export function getConfig(): Config {
  if (_config) return _config
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`[zapi-tests] Missing or invalid env vars:\n${issues}\n\nCopy env.test.example → .env.test and fill in the blanks.`)
  }
  _config = result.data
  return _config
}

// Named export for convenience — throws if env is invalid
export const config = new Proxy({} as Config, {
  get(_target, prop) {
    return getConfig()[prop as keyof Config]
  },
})
