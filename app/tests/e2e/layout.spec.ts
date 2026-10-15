import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { getProject, openApp, partOnScreen, waitForLayout } from './helpers';

async function openExample(page: Page) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByTestId('menu-example').click();
  await expect(page.getByRole('tab', { name: '3D Layout' })).toHaveAttribute('aria-selected', 'true');
  await waitForLayout(page);
}

const airwires = (page: Page) => page.getByTestId('layout-canvas').getAttribute('data-airwires');

async function instanceId(page: Page, ref: string): Promise<string> {
  const p = await getProject(page);
  return Object.values(p.schematic.instances).find((i) => i.ref === ref)!.id;
}

test.describe('3D layout', () => {
  test('example project shows the same airwires as v0.1.1', async ({ page }) => {
    const errors = await openApp(page);
    await openExample(page);
    await expect.poll(() => airwires(page)).toBe('20');
    const p = await getProject(page);
    expect(Object.keys(p.layout.placements)).toHaveLength(12);
    expect(Object.keys(p.layout.wires)).toHaveLength(4);
    expect(errors).toEqual([]);
  });

  test('select a part and move, rotate and swap its footprint with the keyboard', async ({ page }) => {
    await openApp(page);
    await openExample(page);
    const id = await instanceId(page, 'R3');
    // "Frame all" can move the camera after loading; click when stable
    await page.waitForTimeout(300);
    const at = await partOnScreen(page, id);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId('layout-info')).toContainText('R3');

    const before = (await getProject(page)).layout.placements[id]!;
    await page.keyboard.press('6');
    await page.keyboard.press('6');
    await page.keyboard.press('9');
    await page.keyboard.press('d');
    let after = (await getProject(page)).layout.placements[id]!;
    expect(after.position[0]).toBeCloseTo(before.position[0] + 2);
    expect(after.position[1]).toBeCloseTo(before.position[1] + 1);
    expect(after.rotation).not.toEqual(before.rotation);

    await page.keyboard.press('r');
    after = (await getProject(page)).layout.placements[id]!;
    expect(after.rotation).toEqual([0, 0, 0, 1]);

    await page.keyboard.press('f');
    after = (await getProject(page)).layout.placements[id]!;
    expect(after.variant).toBe((before.variant + 1) % 3);
    await expect(page.getByTestId('layout-info')).toContainText(/Footprint/);

    // airwires follow the part
    await expect.poll(() => airwires(page)).toBe('20');
  });

  test('insert a freeform wire on an airwire and remove it again', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('part-RES').click();
    for (const x of [0, 10]) {
      const p = await page.evaluate((gx) => window.__ffpSchematic!.toClient([gx, 0]), x);
      await page.mouse.click(p.x, p.y);
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('w');
    for (const x of [0, 10]) {
      const p = await page.evaluate((gx) => window.__ffpSchematic!.toClient([gx, 3]), x);
      await page.mouse.click(p.x, p.y);
    }
    await page.keyboard.press('F2');
    await waitForLayout(page);
    await expect.poll(() => airwires(page)).toBe('1');
    await page.waitForTimeout(300);

    // click the middle of the airwire
    const mid = await page.evaluate(() => {
      const s = window.__ffpLayout!;
      const w = s.airwires[0]!;
      return s.project3d([(w.from.position[0] + w.to.position[0]) / 2, (w.from.position[1] + w.to.position[1]) / 2, (w.from.position[2] + w.to.position[2]) / 2]);
    });
    await page.mouse.click(mid.x, mid.y);
    await expect(page.getByTestId('layout-info')).toContainText('Airwire');
    await page.keyboard.press('i');
    expect(Object.keys((await getProject(page)).layout.wires)).toHaveLength(1);
    // the wire sits on the first pin: one airwire from its other end to the second part
    await expect.poll(() => airwires(page)).toBe('1');
    await expect(page.getByTestId('layout-info')).toContainText('WIRE1');

    await page.keyboard.press('Delete');
    expect(Object.keys((await getProject(page)).layout.wires)).toHaveLength(0);
    await page.keyboard.press('Control+z');
    expect(Object.keys((await getProject(page)).layout.wires)).toHaveLength(1);
  });

  test('export OBJ writes all parts and airwires', async ({ page }) => {
    await openApp(page);
    await openExample(page);
    const downloads: string[] = [];
    page.on('download', async (d) => downloads.push(readFileSync((await d.path())!, 'utf-8')));
    await page.getByTestId('export-obj').click();
    await expect.poll(() => downloads.length).toBe(2);
    const obj = downloads.find((d) => d.startsWith('# Freeform-Planner 3D scene export'))!;
    const groups = obj.split('\n').filter((l) => l.startsWith('g ')).map((l) => l.slice(2));
    expect(groups).toEqual(expect.arrayContaining(['R1', 'Q2', 'WIRE1', 'H1']));
    expect(groups.filter((g) => g.startsWith('AIRWIRE_'))).toHaveLength(20);
    expect(obj.split('\n').filter((l) => l.startsWith('f ')).length).toBeGreaterThan(1000);
  });
});
