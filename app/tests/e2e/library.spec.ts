import { expect, test } from '@playwright/test';
import { clickGrid, getProject, openApp } from './helpers';

test.describe('library editor', () => {
  test('create a part from an existing symbol and footprint and use it', async ({ page }) => {
    const errors = await openApp(page);
    await page.keyboard.press('F3');
    await page.getByTestId('lib-new').click();
    await expect(page.getByTestId('part-editor')).toBeVisible();
    await page.getByTestId('part-name').fill('Thermistor');
    await page.getByTestId('part-name').press('Enter');
    await page.getByTestId('part-value').fill('NTC 10k');
    await page.getByTestId('part-value').press('Enter');
    await page.getByTestId('part-symbol').selectOption('RES');
    await expect(page.getByTestId('issues')).toContainText('no footprint');
    await page.getByTestId('add-variant').click();
    await page.getByTestId('variant-0').getByLabel('Footprint', { exact: true }).selectOption('RESTHT_SHORT');
    await expect(page.getByText('No problems found')).toBeVisible();

    // the new part is available in the schematic right away
    await page.keyboard.press('F1');
    await page.getByTestId('part-NEW_PART').click();
    await clickGrid(page, 0, 0);
    await page.keyboard.press('Escape');
    const p = await getProject(page);
    const inst = Object.values(p.schematic.instances)[0]!;
    expect(inst).toMatchObject({ partId: 'NEW_PART', value: 'NTC 10k', ref: 'R1' });
    expect(p.library.parts.NEW_PART!.variants[0]!.footprintId).toBe('RESTHT_SHORT');
    expect(Object.keys(p.layout.placements)).toEqual([inst.id]);
    expect(errors).toEqual([]);
  });

  test('symbol editor: add a pin, edit it, undo', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('F3');
    await page.getByRole('tab', { name: /Symbols/ }).click();
    await page.getByTestId('lib-new').click();
    await expect(page.getByTestId('symbol-canvas')).toBeVisible();

    await page.getByTestId('symtool-pin').click();
    const box = (await page.getByTestId('symbol-canvas').boundingBox())!;
    // canvas centre is the symbol origin; 24 px per grid unit
    await page.mouse.click(box.x + box.width / 2 - 24 * 6, box.y + box.height / 2 + 24 * 2);
    await expect(page.getByTestId('pin-props')).toBeVisible();
    await expect(page.getByTestId('pin-number')).toHaveValue('3');
    await page.getByTestId('pin-name').fill('EN');
    await page.getByTestId('pin-name').press('Enter');

    const sym = await page.evaluate(() => window.__ffp!.getState().library.symbols.NEW_SYMBOL!);
    expect(sym.pins[2]).toMatchObject({ number: '3', name: 'EN', at: [-6, 2], dir: 'right' });

    await page.getByRole('button', { name: 'Undo' }).click();
    const undone = await page.evaluate(() => window.__ffp!.getState().library.symbols.NEW_SYMBOL!);
    expect(undone.pins[2]!.name).toBe('');
  });

  test('refuses to delete a footprint that parts use', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('F3');
    await page.getByRole('tab', { name: /Footprints/ }).click();
    await page.getByTestId('lib-item-TO92').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('used by BC547, BC557, BC847');
  });

  test('library changes persist across reloads', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('F3');
    await page.getByTestId('lib-new').click();
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await page.keyboard.press('F3');
    await expect(page.getByTestId('lib-item-NEW_PART')).toBeVisible();
  });
});
