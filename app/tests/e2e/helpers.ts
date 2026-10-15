import { expect, type Page } from '@playwright/test';
import type { Project } from '../../src/core';

/** Opens the app with empty browser storage and fails the test on console errors. */
export async function openApp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  return errors;
}

export async function getProject(page: Page): Promise<Project> {
  return page.evaluate(() => window.__ffp!.getState().history.present);
}

/** Client coordinates of a schematic grid point. */
export async function gridToClient(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([gx, gy]) => window.__ffpSchematic!.toClient([gx!, gy!]), [x, y]);
}

export async function clickGrid(page: Page, x: number, y: number, opts: { double?: boolean } = {}): Promise<void> {
  const p = await gridToClient(page, x, y);
  if (opts.double) await page.mouse.dblclick(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

/** Places a part from the picker at grid points; leaves the place tool afterwards. */
export async function placeParts(page: Page, partId: string, points: [number, number][]): Promise<void> {
  await page.getByTestId(`part-${partId}`).click();
  for (const [x, y] of points) await clickGrid(page, x, y);
  await page.keyboard.press('Escape');
}

/** Draws a wire through the given grid points (orthogonal segments). */
export async function drawWire(page: Page, points: [number, number][]): Promise<void> {
  await page.keyboard.press('w');
  for (const [x, y] of points) await clickGrid(page, x, y);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

export async function netNodes(page: Page): Promise<Record<string, string>> {
  const items = page.getByTestId('netlist').locator('li');
  const result: Record<string, string> = {};
  for (const li of await items.all()) {
    const name = (await li.getAttribute('data-net')) ?? '';
    result[name] = (await li.locator('span.muted').textContent()) ?? '';
  }
  return result;
}

export async function waitForLayout(page: Page): Promise<void> {
  const canvas = page.getByTestId('layout-canvas');
  await expect(canvas).toHaveAttribute('data-loading', '0');
}

/** Screen position of a placed part's origin in the 3D view. */
export async function partOnScreen(page: Page, instanceId: string): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    const p = window.__ffp!.getState().history.present.layout.placements[id]!;
    return window.__ffpLayout!.project3d(p.position);
  }, instanceId);
}
