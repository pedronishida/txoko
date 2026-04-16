# Txoko Cron Workers Deployment Guide

This guide covers deploying the Cloudflare Workers Cron system for Txoko.

## Overview

Txoko uses a dedicated Cloudflare Worker (`txoko-cron`) to manage scheduled background tasks:

1. **iFood Polling** — Every 5 minutes: `/api/cron/ifood-poll`
2. **Automations** — Every hour: `/api/cron/automations`
3. **Daily Checks** — 9 AM UTC: `/api/cron/daily-checks`

Both workers (main app + cron) must have the same `CRON_SECRET` to authenticate requests.

## Step 1: Generate CRON_SECRET

Generate a cryptographically secure random secret (32 bytes):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output:
```
a3f7b9e2c4d8f1a5b7c9d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f
```

Save this value — you'll use it for both workers.

## Step 2: Deploy Main App Worker with CRON_SECRET

Ensure the main app (`apps/web`) has the `CRON_SECRET` configured:

```bash
cd apps/web

# Set the secret
CLOUDFLARE_EMAIL="$YOUR_CF_EMAIL" \
CLOUDFLARE_API_KEY="$YOUR_CF_API_KEY" \
npx wrangler secret put CRON_SECRET

# When prompted, paste the CRON_SECRET value generated above
```

Deploy the main app:
```bash
npm run build
npx wrangler deploy
```

## Step 3: Deploy Cron Worker with CRON_SECRET

```bash
cd workers/cron

# Install dependencies
npm install

# Set the CRON_SECRET (same value as main app)
CLOUDFLARE_EMAIL="$YOUR_CF_EMAIL" \
CLOUDFLARE_API_KEY="$YOUR_CF_API_KEY" \
npx wrangler secret put CRON_SECRET

# When prompted, paste the same CRON_SECRET value

# Deploy
npx wrangler deploy
```

## Step 4: Verify Deployment

Check that the cron worker deployed successfully:

```bash
npx wrangler deployments list
```

Check logs in the Cloudflare dashboard or via CLI:
```bash
npx wrangler tail --format json
```

Within 5 minutes, you should see requests like:
```
[cron] /api/cron/ifood-poll -> 200
```

## Step 5: Monitor Initial Runs

Monitor the Cloudflare Workers dashboard:
1. Navigate to Workers → txoko-cron
2. View the "Logs" tab
3. Confirm periodic executions appear

Check the main app logs for corresponding requests to the endpoints.

## Endpoint Implementation Checklist

Verify all cron endpoints are properly implemented:

- [x] `/api/cron/automations` — exists, has auth check
- [x] `/api/cron/ifood-poll` — exists, has auth check
- [x] `/api/cron/daily-checks` — created, has auth check

All endpoints:
- Return HTTP 401 if `CRON_SECRET` doesn't match
- Accept GET requests with `Authorization: Bearer <CRON_SECRET>` header
- Are set to `export const dynamic = 'force-dynamic'` to avoid caching

## Environment Variables

### Main App (`apps/web`)

No changes needed to `wrangler.jsonc` vars (cron uses HTTP calls only).

### Cron Worker (`workers/cron`)

Set via `wrangler.jsonc`:
- `APP_URL`: Main app URL (default: `https://app.txoko.com.br`)

Set via wrangler secrets:
- `CRON_SECRET`: Same value as main app

## Troubleshooting

### Cron tasks not running

1. Verify cron worker deployed successfully:
   ```bash
   cd workers/cron && npx wrangler deployments list
   ```

2. Check worker status in Cloudflare dashboard:
   - Workers → txoko-cron → Settings → Triggers
   - Confirm cron schedule is set

3. View worker logs:
   ```bash
   npx wrangler tail
   ```

### Endpoints return 401

1. Verify `CRON_SECRET` set on both workers:
   ```bash
   # Check main app
   cd apps/web && npx wrangler secret list
   
   # Check cron worker
   cd workers/cron && npx wrangler secret list
   ```

2. Confirm same secret value on both workers

3. Redeploy if secrets were recently updated:
   ```bash
   npx wrangler deploy --force
   ```

### Timeouts or high latency

1. Check main app health: `curl https://app.txoko.com.br/health` (or similar)
2. Review main app logs for errors during cron calls
3. Adjust schedules in `workers/cron/wrangler.jsonc` if too frequent

### iFood integration not polling

1. Verify at least one iFood integration is enabled in the database:
   ```sql
   SELECT * FROM ifood_integrations WHERE enabled = true;
   ```

2. Check `last_polled_at` column is being updated
3. Review iFood error logs in `ifood_events` table

## Rollback

If issues occur after deployment:

1. Disable cron triggers in the worker:
   - Update `workers/cron/wrangler.jsonc` and remove the `triggers` section
   - Run `npx wrangler deploy`

2. Or temporarily disable the cron worker by deleting it:
   ```bash
   npx wrangler delete txoko-cron
   ```

## Future Enhancements

- [ ] Add dead-letter queue for failed cron tasks
- [ ] Send summary emails after cron runs
- [ ] Add endpoint to manually trigger cron tasks (for testing)
- [ ] Implement exponential backoff for failed requests
- [ ] Add distributed tracing via Honeycomb/DataDog
