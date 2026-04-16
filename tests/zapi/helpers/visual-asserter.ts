// ---------------------------------------------------------------------------
// Visual asserter — Playwright-based assertions on chat message rendering
// in the Txoko inbox UI.
// ---------------------------------------------------------------------------

import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'gif'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'button_actions'
  | 'button_list'
  | 'button_image'
  | 'button_pix'
  | 'button_otp'
  | 'option_list'
  | 'carousel'
  | 'reply'
  | 'deleted_me'
  | 'deleted_everyone'
  | 'edited'
  | 'reaction'
  | 'poll'
  | 'ptv'
  | 'ptt'
  | 'forward'

export type RenderAssertion = {
  messageId: string
  type: MessageType
  expectedText?: string
  expectedMediaType?: string
  expectedButtons?: string[]
  expectedCarouselCards?: number
  expectedReaction?: string
  expectedPollOptions?: string[]
  screenshotsDir?: string
}

export type RenderResult = {
  passed: number
  total: number
  errors: string[]
  screenshotPath: string
}

const SCREENSHOTS_DIR = path.resolve('reports/screenshots')

/**
 * Asserts that a message rendered correctly in the Txoko chat UI.
 * Uses data-message-id attributes to scope all assertions to the specific bubble.
 */
export async function assertMessageRendered(
  page: Page,
  assertion: RenderAssertion,
): Promise<RenderResult> {
  const dir = assertion.screenshotsDir ?? SCREENSHOTS_DIR
  fs.mkdirSync(dir, { recursive: true })

  const screenshotPath = path.join(dir, `${assertion.messageId}.png`)
  const selector = `[data-message-id="${assertion.messageId}"]`
  const errors: string[] = []
  let passed = 0
  let total = 0

  // Wait for the message bubble to appear
  try {
    await page.waitForSelector(selector, { timeout: 10000 })
  } catch {
    errors.push(`message bubble not found in DOM within 10s (selector: ${selector})`)
    return { passed: 0, total: 1, errors, screenshotPath }
  }

  const bubble = page.locator(selector)

  // Helper to run a single assertion without throwing
  async function check(name: string, fn: () => Promise<void>) {
    total++
    try {
      await fn()
      passed++
    } catch (err) {
      errors.push(`${name}: ${(err as Error).message}`)
    }
  }

  switch (assertion.type) {
    case 'text':
      if (assertion.expectedText) {
        await check('text content', async () => {
          await expect(bubble.locator('.message-text')).toContainText(assertion.expectedText!, {
            timeout: 5000,
          })
        })
      }
      break

    case 'image':
    case 'gif':
      await check('image visible', async () => {
        await expect(bubble.locator('img').first()).toBeVisible({ timeout: 5000 })
      })
      break

    case 'video':
    case 'ptv':
      await check('video element visible', async () => {
        const hasVideo = await bubble.locator('video').count()
        const hasThumbnail = await bubble.locator('img').count()
        if (hasVideo === 0 && hasThumbnail === 0) {
          throw new Error('no video or thumbnail found')
        }
      })
      break

    case 'audio':
    case 'ptt':
      await check('audio element visible', async () => {
        const hasAudio = await bubble.locator('audio').count()
        const hasWaveform = await bubble.locator('[class*="waveform"], [class*="audio"]').count()
        if (hasAudio === 0 && hasWaveform === 0) {
          throw new Error('no audio element or waveform found')
        }
      })
      break

    case 'document':
      await check('document link visible', async () => {
        const hasLink = await bubble.locator('a[href], [class*="document"], [class*="file"]').count()
        if (hasLink === 0) throw new Error('no document link found')
      })
      break

    case 'sticker':
      await check('sticker image visible', async () => {
        await expect(bubble.locator('img[alt="sticker"]')).toBeVisible({ timeout: 5000 })
      })
      break

    case 'location':
      await check('location map or link visible', async () => {
        const hasMap = await bubble
          .locator('[class*="location"], [class*="map"], a[href*="maps"]')
          .count()
        if (hasMap === 0) throw new Error('no location element found')
      })
      break

    case 'contact':
      await check('contact card visible', async () => {
        const hasContact = await bubble.locator('[class*="contact"], [class*="vcard"]').count()
        if (hasContact === 0) throw new Error('no contact card found')
      })
      break

    case 'button_actions':
    case 'button_list':
    case 'button_image':
      if (assertion.expectedButtons && assertion.expectedButtons.length > 0) {
        await check(`${assertion.expectedButtons.length} button(s) visible`, async () => {
          for (const label of assertion.expectedButtons!) {
            await expect(
              bubble.locator(`button, [role="button"]`).filter({ hasText: label }),
            ).toBeVisible({ timeout: 5000 })
          }
        })
      } else {
        await check('at least one button visible', async () => {
          const count = await bubble.locator('button, [role="button"]').count()
          if (count === 0) throw new Error('no buttons found')
        })
      }
      break

    case 'button_pix':
      await check('pix button visible', async () => {
        const hasPix = await bubble.locator('[class*="pix"], button').count()
        if (hasPix === 0) throw new Error('no pix element found')
      })
      break

    case 'button_otp':
      await check('otp code visible', async () => {
        const hasOtp = await bubble.locator('[class*="otp"], [class*="code"]').count()
        if (hasOtp === 0) throw new Error('no otp element found')
      })
      break

    case 'option_list':
      await check('option list button visible', async () => {
        const hasBtn = await bubble.locator('button, [role="button"]').count()
        if (hasBtn === 0) throw new Error('no list button found')
      })
      break

    case 'carousel':
      if (assertion.expectedCarouselCards !== undefined) {
        await check(`${assertion.expectedCarouselCards} carousel cards`, async () => {
          await expect(bubble.locator('.carousel-card, [class*="carousel-card"]')).toHaveCount(
            assertion.expectedCarouselCards!,
            { timeout: 5000 },
          )
        })
        await check('carousel counter/nav visible', async () => {
          const hasCounter = await bubble
            .locator('.carousel-counter, [class*="carousel-nav"], [class*="carousel-dot"]')
            .count()
          if (hasCounter === 0) throw new Error('no carousel navigation found')
        })
      } else {
        await check('at least one carousel card', async () => {
          const count = await bubble
            .locator('.carousel-card, [class*="carousel-card"]')
            .count()
          if (count === 0) throw new Error('no carousel cards found')
        })
      }
      break

    case 'reply':
      await check('reply quote visible', async () => {
        const hasQuote = await bubble
          .locator('[class*="reply"], [class*="quote"], blockquote')
          .count()
        if (hasQuote === 0) throw new Error('no reply quote found')
      })
      if (assertion.expectedText) {
        await check('reply text content', async () => {
          await expect(bubble.locator('.message-text')).toContainText(assertion.expectedText!, {
            timeout: 5000,
          })
        })
      }
      break

    case 'deleted_me':
      await check('deleted-for-me indicator', async () => {
        const hasDel = await bubble
          .locator('[class*="deleted"], [class*="removed"]')
          .count()
        if (hasDel === 0) throw new Error('no deleted indicator found')
      })
      break

    case 'deleted_everyone':
      await check('deleted-for-everyone indicator', async () => {
        const hasDel = await bubble
          .locator('[class*="deleted"], [class*="removed"], [aria-label*="apagada"]')
          .count()
        if (hasDel === 0) throw new Error('no deleted-for-everyone indicator found')
      })
      break

    case 'edited':
      await check('edited label visible', async () => {
        const hasEdited = await bubble
          .locator('[class*="edited"], text=editada, text=edited')
          .count()
        if (hasEdited === 0) throw new Error('no edited label found')
      })
      break

    case 'reaction':
      if (assertion.expectedReaction) {
        await check(`reaction emoji "${assertion.expectedReaction}" visible`, async () => {
          await expect(
            bubble.locator('[class*="reaction"]').filter({ hasText: assertion.expectedReaction! }),
          ).toBeVisible({ timeout: 5000 })
        })
      } else {
        await check('at least one reaction visible', async () => {
          const count = await bubble.locator('[class*="reaction"]').count()
          if (count === 0) throw new Error('no reaction found')
        })
      }
      break

    case 'poll':
      if (assertion.expectedPollOptions && assertion.expectedPollOptions.length > 0) {
        await check(`poll options visible`, async () => {
          for (const opt of assertion.expectedPollOptions!) {
            const hasOpt = await bubble.locator(`text="${opt}"`).count()
            if (hasOpt === 0) throw new Error(`poll option "${opt}" not found`)
          }
        })
      } else {
        await check('poll container visible', async () => {
          const hasPoll = await bubble.locator('[class*="poll"]').count()
          if (hasPoll === 0) throw new Error('no poll container found')
        })
      }
      break

    case 'forward':
      await check('forward indicator visible', async () => {
        const hasFwd = await bubble
          .locator('[class*="forward"], text=Encaminhada, text=Forwarded')
          .count()
        if (hasFwd === 0) throw new Error('no forward indicator found')
      })
      break

    default: {
      // Unknown type — just check the bubble is visible
      await check('bubble visible', async () => {
        await expect(bubble).toBeVisible({ timeout: 5000 })
      })
    }
  }

  // Take screenshot regardless of pass/fail
  try {
    await bubble.screenshot({ path: screenshotPath })
  } catch {
    // Non-fatal — screenshot failure should not fail the test
  }

  return { passed, total, errors, screenshotPath }
}

/**
 * Navigates to the Txoko inbox and logs in if not already authenticated.
 */
export async function loginToTxoko(
  page: Page,
  email: string,
  password: string,
  baseUrl: string,
): Promise<void> {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })

  const isLoggedIn = await page
    .locator('[href*="/inbox"], [href*="/home"]')
    .count()
    .then((c) => c > 0)

  if (!isLoggedIn) {
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(home|inbox)/, { timeout: 15000 })
  }
}

/**
 * Navigates to the inbox conversation panel for a specific phone number.
 * Assumes conversation already exists from a prior send.
 */
export async function navigateToConversation(
  page: Page,
  phone: string,
  baseUrl: string,
): Promise<void> {
  await page.goto(`${baseUrl}/inbox`, { waitUntil: 'networkidle' })
  // Try to click conversation row matching the phone
  const row = page.locator(`[data-phone="${phone}"], [data-contact-phone="${phone}"]`).first()
  const found = await row.count()
  if (found > 0) {
    await row.click()
    await page.waitForSelector('[data-message-id]', { timeout: 10000 })
  }
}
