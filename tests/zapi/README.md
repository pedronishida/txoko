# Z-API Test Suite — Txoko

1000-case integration test suite validating Z-API message sending across 3 layers:
API call, webhook reception, and visual rendering in the Txoko chat UI.

---

## Prerequisites

- Node.js 22+
- A Z-API account with an active instance (connected to WhatsApp)
- A test WhatsApp number you control (to receive test messages)
- Supabase project with migration `20260417000000_zapi_test_suite.sql` applied
- Optional: Txoko staging URL + test account credentials (for visual tests)

---

## Setup

```bash
# 1. Install dependencies
cd tests/zapi
npm install

# 2. Configure environment
cp env.test.example .env.test
# Fill in: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN,
#          TEST_TARGET_PHONE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#          WEBHOOK_COLLECTOR_URL

# 3. (Optional) Seed the database with test tenant/contact
# Edit fixtures/seed.sql replacing 55XXXXXXXXXXX with your TEST_TARGET_PHONE
# Then run: psql $DATABASE_URL < fixtures/seed.sql
```

---

## Running Tests

### Smoke test — 10 critical cases, ~15-30 seconds

```bash
npm run test:smoke
```

Checks one case per major category (text, image, audio, document, buttons, carousel, reply, webhook). Exits 0 on all pass, 1 on any failure. Safe to run in CI on every push.

### Generate matrix JSON — verify 1000 cases, no network calls

```bash
npm run test:matrix
# Output: matrix.json with full 1000-case distribution
```

### Full suite — all 1000 cases, ~30 minutes (rate-limited to 1 req/s)

```bash
npm run test:run
```

### Category-only run

```bash
npm run test:run -- --category=carousel
npm run test:run -- --category=button_list
npm run test:run -- --category=media
```

### Skip visual assertions (API + webhook only, much faster)

```bash
npm run test:run -- --skip-visual
```

### Sample N cases for quick validation

```bash
npm run test:run -- --sample=50
```

### Generate HTML report after a run

```bash
npm run test:report
# Opens: reports/html/index.html
```

### Vitest unit runner (runs all suite spec files)

```bash
npm test
# Requires .env.test to be populated
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ZAPI_INSTANCE_ID` | Yes | Z-API instance ID |
| `ZAPI_TOKEN` | Yes | Z-API token |
| `ZAPI_CLIENT_TOKEN` | Yes | Z-API client token (for Client-Token header) |
| `TEST_TARGET_PHONE` | Yes | 55+DDD+number, no spaces (e.g. `5511999990001`) |
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — NEVER commit, set in CI secrets |
| `TXOKO_BASE_URL` | No | Default: `https://app.txoko.com.br` |
| `TXOKO_TEST_USER_EMAIL` | No | Email for Playwright visual tests |
| `TXOKO_TEST_USER_PASSWORD` | No | Password for Playwright visual tests |
| `WEBHOOK_COLLECTOR_URL` | Yes | URL where Z-API sends webhooks (see below) |
| `MAX_CONCURRENCY` | No | Default: 4 (parallel test workers) |
| `RATE_LIMIT_MS` | No | Default: 1000 (milliseconds between API calls) |
| `SKIP_VISUAL` | No | Default: false (set true to skip Playwright) |

---

## Webhook Collector Setup

The suite expects webhook events to be stored in the `zapi_webhook_events` table. You need a receiver endpoint that:

1. Receives POST requests from Z-API
2. Reads the `x-txoko-test-id` header for test correlation
3. Inserts a row into `zapi_webhook_events`

**Configure in Z-API dashboard:**
1. Go to your instance settings
2. Set "Webhook URL" to `WEBHOOK_COLLECTOR_URL` (e.g. `https://app.txoko.com.br/api/webhooks/zapi-test`)
3. Enable event types: `on-message-send`, `on-message-received`, `on-message-status`, `on-message-delete`, `on-presence-chat`

**The receiver endpoint should insert:**
```sql
INSERT INTO zapi_webhook_events (test_id, event_type, message_id, from_me, phone, status, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7)
```

---

## Suite Structure

| Suite | Cases | Description |
|---|---|---|
| `01-media.spec.ts` | 330 | image, video, PTV, audio, PTT, document, GIF, sticker, location, contact |
| `02-buttons.spec.ts` | 250 | button-actions, button-list, button-image, button-pix, button-otp |
| `03-carousel.spec.ts` | 60 | 2/5/10 cards with REPLY and URL buttons |
| `04-replies.spec.ts` | 60 | reply to text, image, audio, button messages |
| `05-deletion.spec.ts` | 75 | delete-for-me, delete-for-everyone (within window), edit |
| `06-reactions.spec.ts` | 40 | add/remove emoji reactions |
| `07-polls.spec.ts` | 30 | single-choice / multi-choice polls |
| `08-status.spec.ts` | 20 | text / image / video status (stories) |
| `09-webhooks.spec.ts` | 60 | pure inbound webhook event validation |
| `10-option-list.spec.ts` | 40 | sections + rows option lists |
| `11-pin-forward.spec.ts` | 30 | pin, unpin, forward |

Suites 06–08, 10–11 have full case definitions in the matrix but only 3 sample test runners implemented. The matrix generator covers all 1000 cases.

---

## Test IDs

Each test case has a deterministic ID: `{category}.{NNN}` (e.g. `carousel.001`, `image.042`, `webhook.015`).
IDs are stable across runs — the same case always has the same ID, enabling result comparison across runs.

---

## Skip Reasons

| Skip Reason | Description |
|---|---|
| `option_list_group` | Option lists are not supported in WhatsApp group chats |
| `carousel_quality` | 10-card carousels may have rendering issues on some clients |
| `delete_window_exceeded` | Delete-for-everyone only works within ~2 minutes of sending |

---

## Troubleshooting

**Rate limit errors (429):** The client has built-in retry with backoff. If you see repeated 429s, increase `RATE_LIMIT_MS` to 2000 or reduce `MAX_CONCURRENCY` to 1.

**Webhook timeout:** Check that `WEBHOOK_COLLECTOR_URL` is correctly configured in Z-API dashboard and that the endpoint is accessible from the internet. Webhooks may take 5-15s to arrive.

**Visual failures:** Ensure `TXOKO_TEST_USER_EMAIL` and `TXOKO_TEST_USER_PASSWORD` are set and the account has access to the inbox. Visual tests look for `[data-message-id]` attributes in the DOM.

**"Expected 1000 cases" error:** Run `npm run test:matrix -- --validate` to get a detailed diff of the distribution.

**Supabase permission errors:** Verify `SUPABASE_SERVICE_ROLE_KEY` is set (not the anon key). The test suite uses service role to bypass RLS.

---

## CI Integration

```yaml
# .github/workflows/zapi-smoke.yml
- name: Z-API Smoke Test
  working-directory: tests/zapi
  env:
    ZAPI_INSTANCE_ID: ${{ secrets.ZAPI_INSTANCE_ID }}
    ZAPI_TOKEN: ${{ secrets.ZAPI_TOKEN }}
    ZAPI_CLIENT_TOKEN: ${{ secrets.ZAPI_CLIENT_TOKEN }}
    TEST_TARGET_PHONE: ${{ secrets.TEST_TARGET_PHONE }}
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    WEBHOOK_COLLECTOR_URL: ${{ secrets.WEBHOOK_COLLECTOR_URL }}
    SKIP_VISUAL: "true"
  run: |
    npm install
    npm run test:smoke
```
