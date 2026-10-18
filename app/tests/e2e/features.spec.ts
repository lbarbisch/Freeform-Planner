import { expect, test, type Page } from '@playwright/test';
import { getProject, openApp, partOnScreen, waitForLayout } from './helpers';

async function openExample(page: Page) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByTestId('menu-example').click();
  await expect(page.getByRole('tab', { name: '3D Layout' })).toHaveAttribute('aria-selected', 'true');
  await waitForLayout(page);
  // "Frame all" can move the camera after loading; click when stable
  await page.waitForTimeout(300);
}

async function instanceId(page: Page, ref: string): Promise<string> {
  const p = await getProject(page);
  return Object.values(p.schematic.instances).find((i) => i.ref === ref)!.id;
}

test('project name can be edited in the top bar and undone', async ({ page }) => {
  await openApp(page);
  const field = page.getByTestId('project-name');
  await expect(field).toHaveValue('Untitled');
  await field.fill('Blinker');
  await field.press('Enter');
  expect((await getProject(page)).name).toBe('Blinker');
  await page.keyboard.press('Control+z');
  await expect(field).toHaveValue('Untitled');
});

test('the schematic cursor position is shown next to the project name', async ({ page }) => {
  await openApp(page);
  const svg = (await page.getByTestId('schematic').boundingBox())!;
  await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2);
  await expect(page.getByTestId('statusbar').getByTestId('cursor-pos')).toHaveText(/· -?\d+, -?\d+/);
  await page.keyboard.press('F2');
  await expect(page.getByTestId('cursor-pos')).toHaveCount(0);
});

test('3D layout: footprint variant dropdown and moving several parts together', async ({ page }) => {
  await openApp(page);
  await openExample(page);
  const r3 = await instanceId(page, 'R3');
  const r4 = await instanceId(page, 'R4');

  let at = await partOnScreen(page, r3);
  await page.mouse.click(at.x, at.y);
  await page.getByTestId('footprint-variant').selectOption('1');
  expect((await getProject(page)).layout.placements[r3]!.variant).toBe(1);

  at = await partOnScreen(page, r4);
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('.layout-view .side-panel')).toContainText('2 objects selected');

  const before = (await getProject(page)).layout.placements;
  await page.keyboard.press('6');
  const after = (await getProject(page)).layout.placements;
  for (const id of [r3, r4]) expect(after[id]!.position[0]).toBeCloseTo(before[id]!.position[0] + 1);
});

test('symbol editor: subparts, zoom and pan', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('F3');
  await page.getByRole('tab', { name: /Symbols/ }).click();
  await page.getByTestId('lib-new').click();
  const canvas = page.getByTestId('symbol-canvas');
  await expect(canvas).toBeVisible();

  await page.getByTestId('symbol-units').fill('2');
  await page.getByTestId('symbol-units').press('Enter');
  await page.getByTestId('symunit-2').click();
  await page.getByTestId('symtool-pin').click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 - 24 * 6, box.y + box.height / 2 + 24 * 2);
  await expect(page.getByTestId('item-unit')).toHaveValue('2');
  const sym = await page.evaluate(() => window.__ffp!.getState().library.symbols.NEW_SYMBOL!);
  expect(sym.units).toBe(2);
  // what the symbol had before is subpart A, B starts empty
  expect(sym.pins.slice(0, 2).map((p) => p.unit ?? 1)).toEqual([1, 1]);
  expect(sym.pins[2]).toMatchObject({ number: '3', unit: 2 });
  // the selected pin glows
  await expect(canvas.locator('.selected .sel-halo')).toHaveCount(1);
  // subpart B shows only its own pin
  await expect(canvas.locator('[data-sel^="pin:"]')).toHaveCount(1);
  // pin numbers are unique across subparts: 1 is taken by subpart A
  await page.getByTestId('pin-number').fill('1');
  await page.getByTestId('pin-number').press('Enter');
  await expect(page.getByRole('alert')).toContainText('Pin number 1 is already used in subpart A');
  await expect(page.getByTestId('pin-number')).toHaveValue('3');

  const viewBox = () => canvas.getAttribute('viewBox');
  const initial = await viewBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(viewBox).not.toBe(initial);
  const zoomed = await viewBox();
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 20);
  await page.mouse.up({ button: 'middle' });
  await expect.poll(viewBox).not.toBe(zoomed);
});

test('footprint editor: selecting a pin highlights it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('F3');
  await page.getByRole('tab', { name: /Footprints/ }).click();
  await page.getByTestId('lib-new').click();
  await page.getByTestId('fp-pin-row-1').locator('td').first().click();
  await expect(page.getByTestId('fp-pin-row-1')).toHaveClass(/selected-row/);
});
