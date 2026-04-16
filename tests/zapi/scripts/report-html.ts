#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// report-html.ts — Generates reports/html/index.html from test_results
// ---------------------------------------------------------------------------

import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSupabaseAdmin } from '../helpers/supabase-admin.js'
import type { TestResultRow, TestRunRow } from '../helpers/supabase-admin.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.floor((p / 100) * sorted.length)
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0
}

async function generateReport(explicitRunId?: string): Promise<void> {
  const admin = getSupabaseAdmin()

  let runId = explicitRunId
  let run: TestRunRow | null = null

  if (!runId) {
    const { data } = await admin.testRuns.selectLatest()
    if (!data) { console.error('[report-html] No test runs found.'); process.exit(1) }
    runId = data.id
    run = data
    console.log(`[report-html] Using latest run: ${runId} (${data.started_at})`)
  } else {
    const { data } = await admin.testRuns.selectById(runId)
    run = data
  }

  const { data: results, error } = await admin.testResults.selectByRunId(runId)
  if (error) { console.error('[report-html] Failed to fetch results:', (error as { message?: string }).message); process.exit(1) }

  const rows = results ?? []

  const byCategory: Record<string, TestResultRow[]> = {}
  for (const row of rows) {
    if (!byCategory[row.category]) byCategory[row.category] = []
    byCategory[row.category]!.push(row)
  }

  const errorCategoryCounts: Record<string, number> = {}
  for (const row of rows) {
    if (row.error_category) errorCategoryCounts[row.error_category] = (errorCategoryCounts[row.error_category] ?? 0) + 1
  }

  const apiLatencies = rows.map((r) => r.api_latency_ms ?? 0).filter((n) => n > 0)
  const webhookLatencies = rows.map((r) => r.webhook_latency_ms ?? 0).filter((n) => n > 0)

  const passed = rows.filter((r) => r.final_status === 'pass').length
  const failed = rows.filter((r) => r.final_status === 'fail').length
  const skipped = rows.filter((r) => r.final_status === 'skipped_by_platform').length
  const total = rows.length
  const successRate = total > 0 ? Math.round((passed / total) * 100) : 0
  const failures = rows.filter((r) => r.final_status !== 'pass' && r.final_status !== 'skipped_by_platform')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Z-API Test Report — ${runId?.substring(0, 8)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', -apple-system, sans-serif; background: #1A1A1A; color: #FAFAF8; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; color: #4ADE80; }
    h2 { font-size: 1rem; color: #78716C; margin-bottom: 1.5rem; }
    h3 { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em; color: #78716C; margin: 2rem 0 0.75rem; }
    .meta { font-size: 0.75rem; color: #78716C; margin-bottom: 2rem; }
    .cards { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
    .card { background: #262626; border-radius: 8px; padding: 1rem 1.5rem; min-width: 140px; }
    .card .val { font-size: 2rem; font-family: 'Space Mono', monospace; font-weight: bold; }
    .card .lbl { font-size: 0.75rem; color: #78716C; margin-top: 0.25rem; }
    .green { color: #4ADE80; } .red { color: #EF4444; } .yellow { color: #F59E0B; } .gray { color: #78716C; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 2rem; }
    th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #333; color: #78716C; font-weight: 500; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #262626; }
    tr:hover td { background: #262626; }
    .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; }
    .badge-pass { background: #14532d; color: #4ADE80; }
    .badge-fail { background: #450a0a; color: #EF4444; }
    .bar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin-top: 0.25rem; }
    .bar-fill { height: 100%; border-radius: 3px; }
    details { background: #262626; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem; }
    summary { cursor: pointer; font-size: 0.85rem; color: #EF4444; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    .failure-detail { font-size: 0.8rem; color: #78716C; margin-top: 0.5rem; padding-left: 0.5rem; border-left: 2px solid #333; }
    .failure-detail code { color: #F59E0B; font-family: 'Space Mono', monospace; font-size: 0.75rem; }
    .search-box { width: 100%; padding: 0.5rem 0.75rem; background: #262626; border: 1px solid #333; border-radius: 6px; color: #FAFAF8; font-size: 0.85rem; margin-bottom: 1rem; }
    .search-box:focus { outline: none; border-color: #4ADE80; }
    hr { border: none; border-top: 1px solid #262626; margin: 2rem 0; }
    footer { margin-top: 3rem; font-size: 0.75rem; color: #78716C; text-align: center; }
  </style>
</head>
<body>
<h1>Z-API Test Report</h1>
<h2>Txoko — WhatsApp Integration Quality Gate</h2>
<div class="meta">Run ID: <code>${runId}</code> | Branch: <code>${run?.branch ?? 'unknown'}</code> | Commit: <code>${run?.commit_sha ?? 'unknown'}</code> | Started: ${run?.started_at ? new Date(run.started_at).toLocaleString('pt-BR') : 'unknown'}</div>

<div class="cards">
  <div class="card"><div class="val">${total}</div><div class="lbl">Total Cases</div></div>
  <div class="card"><div class="val green">${passed}</div><div class="lbl">Passed</div></div>
  <div class="card"><div class="val red">${failed}</div><div class="lbl">Failed</div></div>
  <div class="card"><div class="val gray">${skipped}</div><div class="lbl">Skipped</div></div>
  <div class="card"><div class="val ${successRate >= 90 ? 'green' : successRate >= 70 ? 'yellow' : 'red'}">${successRate}%</div><div class="lbl">Success Rate</div></div>
</div>
<div class="cards">
  <div class="card"><div class="val" style="font-size:1.25rem">${percentile(apiLatencies, 50)}ms</div><div class="lbl">API P50</div></div>
  <div class="card"><div class="val" style="font-size:1.25rem">${percentile(apiLatencies, 95)}ms</div><div class="lbl">API P95</div></div>
  <div class="card"><div class="val" style="font-size:1.25rem">${percentile(webhookLatencies, 50)}ms</div><div class="lbl">Webhook P50</div></div>
  <div class="card"><div class="val" style="font-size:1.25rem">${percentile(webhookLatencies, 95)}ms</div><div class="lbl">Webhook P95</div></div>
</div>

<hr />
<h3>Results by Category</h3>
<table>
  <thead><tr><th>Category</th><th>Total</th><th>Passed</th><th>Failed</th><th>Skipped</th><th>Success Rate</th><th></th></tr></thead>
  <tbody>
    ${Object.entries(byCategory).sort(([a],[b])=>a.localeCompare(b)).map(([cat, catRows]) => {
      const p = catRows.filter(r=>r.final_status==='pass').length
      const f = catRows.filter(r=>r.final_status==='fail').length
      const s = catRows.filter(r=>r.final_status==='skipped_by_platform').length
      const rate = catRows.length > 0 ? Math.round((p/catRows.length)*100) : 0
      const color = rate>=90?'#4ADE80':rate>=70?'#F59E0B':'#EF4444'
      return `<tr><td><strong>${cat}</strong></td><td>${catRows.length}</td><td class="green">${p}</td><td class="${f>0?'red':'gray'}">${f}</td><td class="gray">${s}</td><td><span style="color:${color}">${rate}%</span><div class="bar"><div class="bar-fill" style="width:${rate}%;background:${color}"></div></div></td><td><span class="badge ${f>0?'badge-fail':'badge-pass'}">${f>0?'issues':'ok'}</span></td></tr>`
    }).join('\n')}
  </tbody>
</table>

${Object.keys(errorCategoryCounts).length>0?`<hr /><h3>Top Error Categories</h3><table><thead><tr><th>Error Category</th><th>Count</th></tr></thead><tbody>${Object.entries(errorCategoryCounts).sort(([,a],[,b])=>b-a).slice(0,10).map(([cat,n])=>`<tr><td>${cat}</td><td class="red">${n}</td></tr>`).join('\n')}</tbody></table>`:''}

<hr />
<h3>Failures (${failures.length})</h3>
${failures.length===0?'<p style="color:#4ADE80;font-size:0.9rem">No failures recorded.</p>':`
<input class="search-box" type="text" placeholder="Filter by test ID, category, or error..." id="filterInput" />
<div id="failureList">
  ${failures.map(r=>`<details data-search="${r.test_id} ${r.category} ${r.error_category??''} ${r.api_error??''} ${r.render_error??''}">
    <summary>${r.test_id} — <span style="color:#78716C">${r.category}</span> &nbsp; <span class="badge badge-fail">${r.final_status}</span></summary>
    <div class="failure-detail">
      <p>Endpoint: <code>${r.endpoint}</code></p>
      ${r.api_error?`<p>API Error: <code>${r.api_error}</code></p>`:''}
      ${r.webhook_error?`<p>Webhook: <code>${r.webhook_error}</code></p>`:''}
      ${r.render_error?`<p>Render: <code>${r.render_error}</code></p>`:''}
      ${r.error_category?`<p>Error Category: <code>${r.error_category}</code></p>`:''}
      ${r.api_latency_ms?`<p>API Latency: <code>${r.api_latency_ms}ms</code></p>`:''}
    </div>
  </details>`).join('\n')}
</div>
<script>
  document.getElementById('filterInput').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('#failureList details').forEach(el => {
      el.style.display = el.dataset.search.toLowerCase().includes(q) ? '' : 'none';
    });
  });
</script>`}

<footer>Generated by @txoko/zapi-tests | ${new Date().toISOString()}</footer>
</body>
</html>`

  const outDir = resolve(__dirname, '../reports/html')
  mkdirSync(outDir, { recursive: true })
  const outFile = resolve(outDir, 'index.html')
  writeFileSync(outFile, html, 'utf-8')
  console.log(`[report-html] Report written to: ${outFile}`)
}

export default generateReport

const isMain = process.argv[1] && process.argv[1].includes('report-html')
if (isMain) {
  const args = process.argv.slice(2)
  const runIdArg = args.find((a) => a.startsWith('--run-id='))?.replace('--run-id=', '')
  generateReport(runIdArg).catch((err) => {
    console.error('[report-html] Fatal:', err)
    process.exit(1)
  })
}
