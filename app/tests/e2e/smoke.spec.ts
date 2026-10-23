import { expect, test } from '@playwright/test';
import { openApp, waitForLayout } from './helpers';

test('app starts without errors and every view renders', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.getByTestId('schematic')).toBeVisible();
  await expect(page.getByTestId('part-RES')).toBeVisible();

  await page.getByRole('tab', { name: '3D Layout' }).click();
  await expect(page.getByTestId('layout-canvas').locator('canvas')).toBeVisible();
  await waitForLayout(page);

  await page.getByRole('tab', { name: 'Library' }).click();
  await expect(page.getByTestId('lib-item-RES')).toBeVisible();

  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByTestId('menu-help').click();
  await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByTestId('menu-about').click();
  await expect(page.getByTestId('about')).toContainText(/Freeform-Planner \d+\.\d+\.\d+/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('view shortcuts F1-F3 switch views', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('F2');
  await expect(page.getByRole('tab', { name: '3D Layout' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('F3');
  await expect(page.getByRole('tab', { name: 'Library' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('F1');
  await expect(page.getByRole('tab', { name: 'Schematic' })).toHaveAttribute('aria-selected', 'true');
});
