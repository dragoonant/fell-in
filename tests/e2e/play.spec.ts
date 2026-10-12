// M3 playable: bot vs bot to game over, and a human playing through the UI with real clicks to round 2.
// window.__game is read only to know what the engine is asking; every human answer is a real click or drag.
import { expect, test, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync } from 'node:fs'

interface Snap { round: number; phase: string; kind: string; seat: string; modelId: string | null; over: boolean; idle: boolean }

declare global {
  interface Window {
    __game?: {
      getState(): { round: number; phase: string; pending: { kind: string; seat: string; context: Record<string, unknown> }; models: Record<string, { pos: { x: number; z: number }; owner: string; life: string; offTable?: boolean }> } | null
      idle(): boolean
    }
    __screen?: (x: number, z: number, y?: number) => { x: number; y: number }
  }
}

mkdirSync('e2e-out', { recursive: true })

const snap = (page: Page): Promise<Snap | null> => page.evaluate(() => {
  const s = window.__game?.getState()
  if (!s) return null
  const m = s.pending.context['modelId']
  return { round: s.round, phase: s.phase, kind: s.pending.kind, seat: s.pending.seat, modelId: typeof m === 'string' ? m : null, over: s.phase === 'over', idle: window.__game!.idle() }
})

test('M3 start screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await expect(page.getByTestId('scenario-box-1')).toBeVisible()
  await page.screenshot({ path: 'e2e-out/m3-start.png' })
})

test('bot vs bot plays to game over', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?test=1&seats=bot,bot&seed=e2e&speed=fast')
  await expect(page.getByTestId('game-screen')).toBeVisible()
  await expect(page.getByTestId('hud-result')).toBeVisible({ timeout: 280_000 })
  await expect(page.getByTestId('result-title')).not.toBeEmpty()
  const s = await snap(page)
  expect(s?.over).toBe(true)
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'e2e-out/m3-gameover.png' })
})

test('start screen -> watch bots -> game over -> play again -> menu', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('./')
  await page.getByTestId('scenario-box-1').click()
  await page.getByTestId('mode-watch').click()
  await page.getByTestId('speed-instant').click()
  await page.getByTestId('seed-input').fill('flow')
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('game-screen')).toBeVisible()
  await expect(page.getByTestId('hud-result')).toBeVisible({ timeout: 220_000 })
  await page.getByTestId('play-again').click()
  await expect(page.getByTestId('hud-result')).toBeHidden()
  await expect.poll(() => page.evaluate(() => window.__game === undefined ? 'no-hooks' : 'hooks')).toBe('no-hooks')
  await page.getByTestId('hud-menu-top').click()
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await expect(page.getByTestId('continue-button')).toBeVisible()
})

/** Drag the active model about `inches` toward the far edge with real mouse events on the canvas. */
async function dragMove(page: Page, modelId: string, inches: number): Promise<void> {
  const pts = await page.evaluate(([id, d]) => {
    const m = window.__game!.getState()!.models[id as string]!
    const from = window.__screen!(m.pos.x, m.pos.z, 0.8)
    const to = window.__screen!(m.pos.x * 0.85, m.pos.z - (d as number), 0)
    return { from, to }
  }, [modelId, inches] as const)
  await page.mouse.move(pts.from.x, pts.from.y)
  await page.mouse.down()
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(pts.from.x + ((pts.to.x - pts.from.x) * i) / steps, pts.from.y + ((pts.to.y - pts.from.y) * i) / steps)
    await page.waitForTimeout(45)
  }
  await expect(page.getByTestId('ruler-readout')).toBeVisible()
  await page.mouse.up()
}

test('human vs bot: activate, move by drag, attack or end, reach round 2', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?test=1&seats=human,bot&seed=e2e')
  await expect(page.getByTestId('game-screen')).toBeVisible()
  await expect(page.getByTestId('hud-topbar')).toBeVisible()
  await page.getByTestId('hud-speed').selectOption('3')

  let moved = 0, attacks = 0, ended = 0, shot = false
  const movedIn = new Set<string>()
  const deadline = Date.now() + 270_000
  while (Date.now() < deadline) {
    const s = await snap(page)
    if (!s) { await page.waitForTimeout(150); continue }
    if (s.over) break
    if (s.round >= 2 && moved > 0 && (attacks > 0 || ended > 0) && (shot || s.round >= 4)) break

    const activation = page.getByTestId('activation-panel')
    const prompt = page.getByTestId('hud-prompt')
    if (await activation.isVisible()) {
      const key = `${s.round}:${s.modelId}`
      const shoot = activation.locator('[data-testid^="prompt-option-shoot"], [data-testid^="prompt-option-attack"]')
      if (!shot && await shoot.count() > 0) {
        await shoot.first().click()
        await expect(page.getByTestId('hud-prompt')).toBeVisible()
        await page.getByTestId('prompt-options').locator('button').first().click()
        await expect(page.getByTestId('odds-panel')).toBeVisible()
        // The money shot: odds for this attack beside the tray still showing an earlier attack's dice and verdict.
        if (await page.getByTestId('dice-verdict').isVisible()) {
          await page.screenshot({ path: 'e2e-out/m3-midgame.png' })
          shot = true
        }
        await page.getByTestId('prompt-confirm').click()
        attacks++
        if (!shot) {
          await expect(page.getByTestId('dice-verdict')).toBeVisible({ timeout: 20_000 })
          await page.screenshot({ path: 'e2e-out/m3-midgame.png' })
        }
      } else if (!movedIn.has(key) && await activation.getByTestId('prompt-option-move').isVisible()) {
        movedIn.add(key)
        await activation.getByTestId('prompt-option-move').click()
        await expect(prompt).toHaveAttribute('data-kind', 'move.path')
        const before = await page.evaluate((id) => window.__game!.getState()!.models[id]!.pos, s.modelId!)
        await dragMove(page, s.modelId!, 5)
        await expect.poll(() => page.evaluate((id) => window.__game!.getState()!.pending.kind, s.modelId!)).not.toBe('move.path')
        const after = await page.evaluate((id) => window.__game!.getState()!.models[id]!.pos, s.modelId!)
        if (Math.hypot(after.x - before.x, after.z - before.z) > 0.5) moved++
      } else {
        await activation.getByTestId('prompt-option-end').click()
        ended++
      }
      await page.waitForTimeout(100)
      continue
    }
    if (await prompt.isVisible()) {
      const kind = await prompt.getAttribute('data-kind')
      if (kind === 'move.path') {
        await prompt.locator('[data-testid^="prompt-option-"]').first().click()
      } else {
        await prompt.locator('[data-testid^="prompt-option-"]').first().click()
        const confirm = page.getByTestId('prompt-confirm')
        if (await confirm.isVisible()) await confirm.click()
      }
      await page.waitForTimeout(100)
      continue
    }
    await page.waitForTimeout(150)
  }
  const s = await snap(page)
  expect(s!.round).toBeGreaterThanOrEqual(2)
  expect(moved).toBeGreaterThan(0)
  expect(attacks + ended).toBeGreaterThan(0)
  if (attacks === 0) {
    // No shot came into range: still record a midgame view of the table.
    await page.screenshot({ path: 'e2e-out/m3-midgame.png' })
  }
  mkdirSync('screenshots', { recursive: true })
  copyFileSync('e2e-out/m3-midgame.png', 'screenshots/m3-playable.png')
})
