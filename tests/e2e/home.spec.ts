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
