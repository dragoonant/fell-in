// Campaign: start screen -> new campaign -> settlement -> one step -> To battle -> the game screen; and the way back.
// window.__campaign (?test=1) is read only to know what the campaign holds; the player's path is real clicks.
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

mkdirSync('e2e-out', { recursive: true })

/** window.__campaign and window.__game, read inside page.evaluate (typed loosely so this file declares no globals). */
type Probe = { __campaign?: { get(): { name: string; round: number; players: { caps: number; step: string }[] } | null; steps(): { id: string; state: string }[]; error(): string | null }; __game?: { getState(): { phase: string } | null; legalActions(): unknown[]; submit(a: unknown): unknown } }

test('CAMP-UI-E2E-1 new campaign -> one step -> to battle -> game screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await page.getByTestId('campaign-new').click()
  await expect(page.getByTestId('campaign-screen')).toBeVisible()
  await expect(page.getByTestId('settlement-step').first()).toBeVisible()
  await expect(page.getByTestId('settlement-error')).toHaveCount(0)
  await page.screenshot({ path: 'e2e-out/campaign-settlement.png' })
  await page.getByTestId('step-next').click()
  await expect(page.getByTestId('settlement-error')).toHaveCount(0)
  await page.getByTestId('to-battle').click()
  await expect(page.getByTestId('game-screen')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
})

test('CAMP-UI-E2E-2 ?test=1&campaign=new opens the settlement and exposes window.__campaign', async ({ page }) => {
  await page.goto('./?test=1&campaign=new&seed=e2e-camp')
  await expect(page.getByTestId('campaign-screen')).toBeVisible()
  await expect(page.getByTestId('campaign-name')).not.toBeEmpty()
  const probe = await page.evaluate(() => {
    const w = window as unknown as Probe
    const c = w.__campaign?.get()
    return c ? { round: c.round, step: c.players[0]?.step ?? null, steps: w.__campaign!.steps().length } : null
  })
  expect(probe).not.toBeNull()
  expect(probe!.round).toBeGreaterThanOrEqual(1)
  expect(probe!.steps).toBeGreaterThan(5)
  // no game started by the test flag
  await expect(page.getByTestId('game-screen')).toHaveCount(0)
})

test('CAMP-UI-E2E-3 a saved campaign shows Continue on the start screen and reopens', async ({ page }) => {
  await page.goto('./?test=1&campaign=new&seed=e2e-save')
  await expect(page.getByTestId('campaign-screen')).toBeVisible()
  await page.goto('./')
  await expect(page.getByTestId('campaign-continue')).toBeVisible()
  await page.getByTestId('campaign-continue').click()
  await expect(page.getByTestId('campaign-screen')).toBeVisible()
  await expect(page.getByTestId('campaign-name')).not.toBeEmpty()
})

test('CAMP-UI-E2E-4 a finished campaign battle returns to the settlement', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?test=1&campaign=new&seed=e2e-back&speed=instant')
  await expect(page.getByTestId('campaign-screen')).toBeVisible()
  const before = await page.evaluate(() => (window as unknown as Probe).__campaign!.get()!.players[0]!.caps)
  await page.getByTestId('to-battle').click()
  await expect(page.getByTestId('game-screen')).toBeVisible()
  await page.waitForFunction(() => (window as unknown as Probe).__game !== undefined)
  // Play the whole battle with random legal answers (every answer goes through the engine's own checks).
  await page.evaluate(async () => {
    const g = (window as unknown as Probe).__game!
    for (let i = 0; i < 40000; i++) {
      const s = g.getState()
      if (!s || s.phase === 'over') break
      const la = g.legalActions()
      if (!la.length) { await new Promise((r) => setTimeout(r, 5)); continue }
      g.submit(la[Math.floor(Math.random() * la.length)])
      if (i % 200 === 0) await new Promise((r) => setTimeout(r, 0))
    }
  })
  await expect(page.getByTestId('hud-result')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('back-to-settlement')).toBeVisible()
  await page.getByTestId('back-to-settlement').click()
  await expect(page.getByTestId('campaign-screen')).toBeVisible()
  await expect(page.getByTestId('settlement-error')).toHaveCount(0)
  const after = await page.evaluate(() => (window as unknown as Probe).__campaign!.get()!.players[0]!.caps)
  // the battle paid out (winner or loser, caps rise; a settlement spends nothing in a battle)
  expect(after).toBeGreaterThanOrEqual(before)
  await page.screenshot({ path: 'e2e-out/campaign-after-battle.png' })
})
