// A new player opening a scenario sees the briefing, starts, and sees the objective tracker.
import { expect, test } from '@playwright/test'

test('briefing opens for the Red Rocket scenario, Start dismisses it, tracker shows Round 1 of 4', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?seats=human,official&scenario=ai-rr&seed=e2e-brief&speed=fast')
  await expect(page.getByTestId('briefing')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('briefing-title')).toHaveText('The Red Rocket Misunderstanding')
  await expect(page.getByTestId('briefing-goal')).toBeVisible()
  await expect(page.getByTestId('briefing-enemy')).toContainText('Wasteland AI')
  await page.screenshot({ path: 'e2e-out/briefing.png' })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByTestId('briefing')).toBeHidden()
  await expect(page.getByTestId('objective-tracker')).toContainText('Round 1 of 4')
  await page.getByTestId('hud-briefing').click()
  await expect(page.getByTestId('briefing')).toBeVisible()
  await page.getByTestId('briefing-start').click()
  await page.screenshot({ path: 'e2e-out/tracker.png' })
})
