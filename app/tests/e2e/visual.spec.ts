import { expect, test } from '@playwright/test';
import { openApp, waitForLayout } from './helpers';

/** Screenshot comparisons catch rendering changes that functional tests miss. Baselines are per
 * platform; update them on purpose with `npm run e2e:update` and review the diff. */
test.describe('visual', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'baselines are kept for Chromium only');

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByTestId('menu-example').click();
    await waitForLayout(page);
    // wait for the automatic "frame all"
    await page.waitForTimeout(500);
  });

  test('3D layout of the example', async ({ page }) => {
    await expect(page.getByTestId('layout-canvas')).toHaveScreenshot('layout-example.png');
  });

  test('schematic of the example', async ({ page }) => {
    await page.keyboard.press('F1');
    await page.waitForTimeout(300);
    await expect(page.getByTestId('schematic')).toHaveScreenshot('schematic-example.png');
  });

  test('symbol editor', async ({ page }) => {
    await page.keyboard.press('F3');
    await page.getByRole('tab', { name: /Symbols/ }).click();
    await page.getByTestId('lib-item-NE555').click();
    await expect(page.getByTestId('symbol-canvas')).toHaveScreenshot('symbol-ne555.png');
  });
});
