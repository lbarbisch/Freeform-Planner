import { expect, test } from '@playwright/test';
import { clickGrid, getProject, netNodes, openApp, placeParts } from './helpers';

// RES pins: 1 at (0,-3), 2 at (0,3). LED5MM pins: K/1 at (-4,0), A/2 at (2,0).

test.describe('schematic editor', () => {
  test('place parts, wire them and get the expected netlist', async ({ page }) => {
    const errors = await openApp(page);
    await placeParts(page, 'RES', [
      [0, 0],
      [10, 0],
    ]);
    await placeParts(page, 'LED5MM', [[20, 0]]);

    const project = await getProject(page);
    expect(Object.values(project.schematic.instances).map((i) => i.ref)).toEqual(['R1', 'R2', 'D1']);
    // new parts show up in the 3D layout immediately
    expect(Object.keys(project.layout.placements)).toHaveLength(3);

    // straight wire between two pins finishes automatically on the second pin
    await page.keyboard.press('w');
    await clickGrid(page, 0, 3);
    await clickGrid(page, 10, 3);
    // L-shaped wire from R2.1 to D1.K
    await clickGrid(page, 10, -3);
    await clickGrid(page, 16, 0);
    await page.keyboard.press('Escape');

    // net label connects R1.1 and D1.A without a wire
    await page.keyboard.press('l');
    await clickGrid(page, 0, -3);
    await page.getByTestId('prompt-input').fill('VIN');
    await page.keyboard.press('Enter');
    await clickGrid(page, 22, 0);
    await expect(page.getByTestId('prompt-input')).toHaveValue('VIN');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');

    expect(await netNodes(page)).toEqual({
      VIN: 'D1.2 R1.1',
      'Net-(D1-1)': 'D1.1 R2.1',
      'Net-(R1-2)': 'R1.2 R2.2',
    });
    expect(Object.keys((await getProject(page)).schematic.wires)).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  test('dragging a part keeps its wires connected; undo and redo', async ({ page }) => {
    await openApp(page);
    await placeParts(page, 'RES', [
      [0, 0],
      [10, 0],
    ]);
    await page.keyboard.press('w');
    await clickGrid(page, 0, 3);
    await clickGrid(page, 10, 3);
    await page.keyboard.press('Escape');

    const from = await page.evaluate(() => window.__ffpSchematic!.toClient([0, 0]));
    const to = await page.evaluate(() => window.__ffpSchematic!.toClient([0, -6]));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();

    let p = await getProject(page);
    const r1 = Object.values(p.schematic.instances).find((i) => i.ref === 'R1')!;
    expect(r1.at).toEqual([0, -6]);
    expect(Object.values(p.schematic.wires)[0]).toMatchObject({ a: [0, -3], b: [10, 3] });
    expect(await netNodes(page)).toMatchObject({ 'Net-(R1-2)': 'R1.2 R2.2' });

    // the whole drag is one undo step
    await page.keyboard.press('Control+z');
    p = await getProject(page);
    expect(p.schematic.instances[r1.id]!.at).toEqual([0, 0]);
    await page.keyboard.press('Control+y');
    p = await getProject(page);
    expect(p.schematic.instances[r1.id]!.at).toEqual([0, -6]);
  });

  test('edit reference and value, rotate, delete with undo', async ({ page }) => {
    await openApp(page);
    await placeParts(page, 'RES', [[0, 0]]);
    await clickGrid(page, 0, 0);
    await expect(page.getByTestId('instance-props')).toBeVisible();
    await page.getByTestId('prop-value').fill('4k7');
    await page.getByTestId('prop-value').press('Enter');
    await page.getByTestId('prop-ref').fill('R10');
    await page.getByTestId('prop-ref').press('Enter');
    await clickGrid(page, 0, 0);
    await page.keyboard.press('r');
    let inst = Object.values((await getProject(page)).schematic.instances)[0]!;
    expect(inst).toMatchObject({ ref: 'R10', value: '4k7', rotation: 90 });

    await page.keyboard.press('Delete');
    expect(Object.keys((await getProject(page)).schematic.instances)).toHaveLength(0);
    expect(Object.keys((await getProject(page)).layout.placements)).toHaveLength(0);
    await page.keyboard.press('Control+z');
    inst = Object.values((await getProject(page)).schematic.instances)[0]!;
    expect(inst.ref).toBe('R10');
  });

  test('power symbols name nets and box selection selects everything inside', async ({ page }) => {
    await openApp(page);
    await placeParts(page, 'RES', [
      [0, 0],
      [10, 0],
    ]);
    // GND pin is at its origin: place it right on the lower pins
    await placeParts(page, 'GND', [
      [0, 3],
      [10, 3],
    ]);
    expect(await netNodes(page)).toMatchObject({ GND: 'R1.2 R2.2' });

    const a = await page.evaluate(() => window.__ffpSchematic!.toClient([-5, -6]));
    const b = await page.evaluate(() => window.__ffpSchematic!.toClient([15, 8]));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    const sel = await page.evaluate(() => window.__ffp!.getState().selection.instances.length);
    expect(sel).toBe(4);
  });
});
