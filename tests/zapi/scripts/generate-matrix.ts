#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// generate-matrix.ts
// CLI: tsx scripts/generate-matrix.ts [--output=path/to/matrix.json]
//
// Outputs the full 1000-case matrix as JSON.
// Does NOT require env vars — safe to run offline.
// ---------------------------------------------------------------------------

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateTestMatrix, MATRIX_DISTRIBUTION } from '../helpers/test-matrix.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function parseArgs(): { output: string; validate: boolean } {
  const args = process.argv.slice(2)
  let output = resolve(__dirname, '../matrix.json')
  let validate = false

  for (const arg of args) {
    if (arg.startsWith('--output=')) {
      output = resolve(arg.replace('--output=', ''))
    }
    if (arg === '--validate') {
      validate = true
    }
  }

  return { output, validate }
}

function main() {
  const { output, validate } = parseArgs()

  console.log('[generate-matrix] Generating test matrix...')
  const startedAt = Date.now()

  let matrix: ReturnType<typeof generateTestMatrix>
  try {
    matrix = generateTestMatrix()
  } catch (err) {
    console.error('[generate-matrix] FAILED:', (err as Error).message)
    process.exit(1)
  }

  const elapsed = Date.now() - startedAt

  // Category distribution
  const distribution: Record<string, number> = {}
  for (const tc of matrix) {
    distribution[tc.category] = (distribution[tc.category] ?? 0) + 1
  }

  // Endpoint coverage
  const endpoints = new Set(matrix.map((tc) => tc.endpoint))

  if (validate) {
    let hasError = false

    // Check all testIds are unique
    const ids = new Set<string>()
    for (const tc of matrix) {
      if (ids.has(tc.testId)) {
        console.error(`[generate-matrix] DUPLICATE testId: ${tc.testId}`)
        hasError = true
      }
      ids.add(tc.testId)
    }

    // Check distribution matches spec
    for (const [cat, expected] of Object.entries(MATRIX_DISTRIBUTION)) {
      const actual = distribution[cat] ?? 0
      if (actual !== expected) {
        console.error(`[generate-matrix] Distribution mismatch for "${cat}": expected ${expected}, got ${actual}`)
        hasError = true
      }
    }

    if (hasError) {
      process.exit(1)
    }
  }

  // Write JSON
  const output_data = {
    generated_at: new Date().toISOString(),
    total: matrix.length,
    distribution,
    endpoints: Array.from(endpoints).sort(),
    cases: matrix,
  }

  writeFileSync(output, JSON.stringify(output_data, null, 2), 'utf-8')

  console.log(`
[generate-matrix] Done in ${elapsed}ms

  Total cases  : ${matrix.length}
  Output       : ${output}
  Endpoints    : ${endpoints.size} unique endpoints

  Distribution:
${Object.entries(distribution)
  .sort(([, a], [, b]) => b - a)
  .map(([cat, n]) => `    ${cat.padEnd(20)} ${n}`)
  .join('\n')}
  `)

  if (matrix.length !== 1000) {
    console.error(`[generate-matrix] ERROR: Expected 1000, got ${matrix.length}`)
    process.exit(1)
  }

  console.log('[generate-matrix] Verified: exactly 1000 test cases generated.')
}

main()
