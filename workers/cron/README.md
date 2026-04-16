# Txoko Cron Worker

Scheduled background tasks for Txoko running on Cloudflare Workers.

## Scheduled Tasks

The cron worker triggers the following endpoints at Txoko's main app:

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/ifood-poll` | Every 5 minutes | Poll iFood for new orders and events |
| `/api/cron/automations` | Hourly (top of each hour) | Process time-based automations (birthdays, inactive customers, low stock) |
| `/api/cron/daily-checks` | Daily at 9 AM UTC | Daily scheduled checks (birthdays, inactive reminders, upcoming reservations) |

All endpoints require authentication via `Authorization: Bearer <CRON_SECRET>` header.

## Deployment

### Prerequisites

- Cloudflare account with API credentials
- CRON_SECRET environment variable (shared with main app)

### Setup

1. Generate CRON_SECRET (32-byte random hex):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. Set the secret on the cron worker:
```bash
cd workers/cron
CLOUDFLARE_EMAIL="your-email@example.com" \
CLOUDFLARE_API_KEY="your-api-key" \
npx wrangler secret put CRON_SECRET
# Paste the generated secret when prompted
```

3. Set the same secret on the main app worker:
```bash
cd apps/web
CLOUDFLARE_EMAIL="your-email@example.com" \
CLOUDFLARE_API_KEY="your-api-key" \
npx wrangler secret put CRON_SECRET
# Paste the same secret when prompted
```

4. Deploy the cron worker:
```bash
cd workers/cron
CLOUDFLARE_EMAIL="your-email@example.com" \
CLOUDFLARE_API_KEY="your-api-key" \
npx wrangler deploy
```

### Verify Deployment

Check the Cloudflare dashboard or use wrangler to view logs:
```bash
npx wrangler tail --format json
```

You should see periodic requests to the endpoints every 5 minutes.

## Environment Variables

- `APP_URL`: URL of the main Txoko app (default: `https://app.txoko.com.br`)
- `CRON_SECRET`: Authentication token for cron endpoints

## Architecture

The cron worker is separate from the main app to:
1. Avoid blocking the main app worker with background tasks
2. Use Cloudflare's native Cron Triggers (vs. external schedulers)
3. Keep scheduling logic centralized in one place
4. Make it easier to adjust schedules without redeploying the main app

The worker makes HTTP requests to the main app's API, which handles the actual business logic.

## Troubleshooting

### Endpoints return 401 Unauthorized
- Check that `CRON_SECRET` is set on both workers
- Verify the exact same secret is used on both

### Endpoints timeout
- Check the main app is responding to HTTP requests
- Review logs in Cloudflare Workers dashboard
- Increase timeout in main app routes if needed

### High request latency
- iFood polling every 5 min may be too frequent; adjust in `wrangler.jsonc`
- Consider batching multiple restaurants in one request
