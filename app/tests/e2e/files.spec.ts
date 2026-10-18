import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { getProject, openApp, placeParts } from './helpers';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

test.describe('files', () => {
  test('save, start over and open the saved file again', async ({ page }) => {
    await openApp(page);
    await placeParts(page, 'RES', [
      [0, 0],
      [10, 0],
    ]);
    const original = await getProject(page);

    const download = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    const file = await (await download).path();
    await expect(page.getByTestId('file-name')).toHaveText('Untitled.ffp.json');

    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('button', { name: 'New' }).click();
    expect(Object.keys((await getProject(page)).schematic.instances)).toHaveLength(0);

    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Control+o');
    await (await chooser).setFiles({ name: 'Untitled.ffp.json', mimeType: 'application/json', buffer: readFileSync(file!) });
    await expect.poll(async () => Object.keys((await getProject(page)).schematic.instances).length).toBe(2);
    expect(await getProject(page)).toEqual(original);
  });

  test('opens a converted v0.1.x project', async ({ page }) => {
    await openApp(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByTestId('menu-open').click();
    await (await chooser).setFiles(join(fixtures, 'v0.1.1-transistor-blinker.legacy.json'));
    await expect(page.getByTestId('statusbar')).toContainText('12 parts · 8 nets · 4 wires');
  });

  test('shows a readable error for invalid files', async ({ page }) => {
    await openApp(page);
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Control+o');
    await (await chooser).setFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"formatVersion": 1}') });
    await expect(page.getByRole('alert')).toContainText('Could not open broken.json');
  });

  test('restores unsaved work after a reload', async ({ page }) => {
    await openApp(page);
    await placeParts(page, 'CAP', [[0, 0]]);
    await page.waitForTimeout(900); // autosave is debounced
    page.on('dialog', (d) => void d.accept());
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByText(/Restored unsaved work/)).toBeVisible();
    expect(Object.values((await getProject(page)).schematic.instances).map((i) => i.ref)).toEqual(['C1']);
  });
});
