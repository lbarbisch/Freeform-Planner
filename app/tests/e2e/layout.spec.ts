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

    await page.keyboard.press('Shift+R');
    after = (await getProject(page)).layout.placements[id]!;
    expect(after.rotation).toEqual([0, 0, 0, 1]);

    await page.keyboard.press('f');
    after = (await getProject(page)).layout.placements[id]!;
    expect(after.variant).toBe((before.variant + 1) % 3);
    await expect(page.getByTestId('layout-info')).toContainText(/Footprint/);

    // airwires follow the part
    await expect.poll(() => airwires(page)).toBe('20');
  });

  test('insert a wire on an airwire and remove it again', async ({ page }) => {
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
    // the staging grid puts both resistors in a row, so the airwire runs inside the leads of R1
    // and is hidden; move R2 aside so the airwire crosses open space
    await page.evaluate(() => {
      const store = window.__ffp!;
      const r2 = Object.values(store.getState().history.present.schematic.instances).find((i) => i.ref === 'R2')!.id;
      store.apply((p) => ({ ...p, layout: { ...p.layout, placements: { ...p.layout.placements, [r2]: { ...p.layout.placements[r2]!, position: [15, 0, 30] } } } }));
    });
    await page.waitForTimeout(300);

    // click a visible point of the airwire (parts in front of it hide it)
    const mid = await page.evaluate(() => {
      const s = window.__ffpLayout!;
      const w = s.airwires[0]!;
      for (let t = 0.5; t < 1; t += 0.02) {
        const q = s.project3d([0, 1, 2].map((k) => w.from.position[k]! + (w.to.position[k]! - w.from.position[k]!) * t) as [number, number, number]);
        // Firefox and WebKit deliver whole-pixel pointer coordinates
        const p = { x: Math.round(q.x), y: Math.round(q.y) };
        if (s.pickAt(p.x, p.y)?.kind === 'airwire') return p;
      }
      throw new Error('airwire is hidden everywhere');
    });
    await page.mouse.click(mid.x, mid.y);
    await expect(page.getByTestId('layout-info')).toContainText('Airwire');
    await page.getByTestId('insert-wire').click();
    expect(Object.keys((await getProject(page)).layout.wires)).toHaveLength(1);
    // the wire sits on the first pin: one airwire from its other end to the second part
    await expect.poll(() => airwires(page)).toBe('1');
    await expect(page.getByTestId('layout-info')).toContainText('WIRE1');

    await page.getByTestId('delete-wire').click();
    expect(Object.keys((await getProject(page)).layout.wires)).toHaveLength(0);
    await page.keyboard.press('Control+z');
    expect(Object.keys((await getProject(page)).layout.wires)).toHaveLength(1);
    await page.getByTestId('layout-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    expect(Object.keys((await getProject(page)).layout.wires)).toHaveLength(0);
  });

  test('box selection, select all and typing position and rotation', async ({ page }) => {
    await openApp(page);
    await openExample(page);
    await page.waitForTimeout(300);
    const box = (await page.getByTestId('layout-canvas').boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 4 });
    await page.mouse.up();
    const selected = () => page.evaluate(() => window.__ffp!.getState().selection);
    expect((await selected()).instances).toHaveLength(12);
    expect((await selected()).layoutWires).toHaveLength(4);

    await page.keyboard.press('Escape');
    expect((await selected()).instances).toHaveLength(0);
    await page.keyboard.press('Control+a');
    expect((await selected()).instances).toHaveLength(12);
    expect((await selected()).layoutWires).toHaveLength(4);

    const id = await instanceId(page, 'R3');
    await page.evaluate((i) => window.__ffp!.select({ instances: [i] }), id);
    await page.getByTestId('position-x').fill('12.5');
    await page.getByTestId('position-x').press('Enter');
    await page.getByTestId('rotation-z').fill('90');
    await page.getByTestId('rotation-z').press('Enter');
    const t = (await getProject(page)).layout.placements[id]!;
    expect(t.position[0]).toBe(12.5);
    expect(t.rotation[2]).toBeCloseTo(Math.SQRT1_2);
    expect(t.rotation[3]).toBeCloseTo(Math.SQRT1_2);
  });

  test('export OBJ writes all parts and airwires', async ({ page }) => {
    await openApp(page);
    await openExample(page);
    const downloads: string[] = [];
    page.on('download', async (d) => downloads.push(readFileSync((await d.path())!, 'utf-8')));
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByTestId('export-obj').click();
    await expect.poll(() => downloads.length).toBe(2);
    const obj = downloads.find((d) => d.startsWith('# Freeform-Planner 3D scene export'))!;
    const groups = obj.split('\n').filter((l) => l.startsWith('g ')).map((l) => l.slice(2));
    expect(groups).toEqual(expect.arrayContaining(['R1', 'Q2', 'WIRE1', 'H1']));
    expect(groups.filter((g) => g.startsWith('AIRWIRE_'))).toHaveLength(20);
    expect(obj.split('\n').filter((l) => l.startsWith('f ')).length).toBeGreaterThan(1000);
  });
});
