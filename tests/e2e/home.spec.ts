import { expect, test } from '@playwright/test'

test('app boots to the start screen and opens the table', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Fell-in: Wasteland Warfair')
  await expect(page.getByRole('heading', { name: 'Fell-in: Wasteland Warfair' })).toBeVisible()
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('game-screen')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
})

test('M0 screenshot of the table', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?test=1&seed=demo')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'screenshots/m0-table.png' })
})

test('COOP-001 start screen: official AI opponent, team toggle and filtered scenarios', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('opponent-official').click()
  await expect(page.getByTestId('team-size')).toBeVisible()
  await expect(page.getByTestId('scenario-box-1')).toHaveCount(0)
  await expect(page.getByTestId('scenario-ai-rr')).toBeVisible()
  await page.getByTestId('team-2').click()
  await expect(page.getByTestId('team-2')).toHaveAttribute('aria-pressed', 'true')
})

test('AI-015 ?seats=human,official starts a solo AI scenario', async ({ page }) => {
  await page.goto('./?test=1&seats=human,official&seed=e2e-official&speed=fast')
  await expect(page.getByTestId('game-screen')).toBeVisible()
  const seats = await page.evaluate(() => (window as unknown as { __game: { getState(): { seatOrder: string[] } } }).__game.getState().seatOrder)
  expect(seats).toEqual(['A', 'ai'])
})
