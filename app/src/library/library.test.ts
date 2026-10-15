import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeAirwires, deriveNetlist, loadProject, round3, type Vec3 } from '../core';
import { builtinLibrary as lib } from './builtin';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..', '..');

describe('built-in library', () => {
  it('has the parts of v0.1.x', () => {
    expect(Object.keys(lib.parts).sort()).toEqual(
      expect.arrayContaining(['BC547', 'BC557', 'BC847', 'CAP', 'DIODE', 'LED5MM', 'NE555', 'PORT', 'RES', 'TL072', 'GND']),
    );
  });

  it.each(Object.values(lib.symbols))('symbol $id has unique pins on the integer grid', (symbol) => {
    const numbers = symbol.pins.map((p) => p.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const p of symbol.pins) {
      expect(Number.isInteger(p.at[0]) && Number.isInteger(p.at[1]), `${symbol.id} pin ${p.number} at ${p.at}`).toBe(true);
    }
  });

  it.each(Object.values(lib.parts))('part $id maps every symbol pin to an existing footprint pin', (part) => {
    const symbol = lib.symbols[part.symbolId]!;
    expect(symbol).toBeDefined();
    for (const v of part.variants) {
      const fp = lib.footprints[v.footprintId]!;
      expect(fp, v.footprintId).toBeDefined();
      const fpPins = new Set(fp.pins.map((p) => p.number));
      for (const sp of symbol.pins) {
        expect(fpPins.has(v.pinMap[sp.number] ?? ''), `${part.id}/${fp.id} symbol pin ${sp.number}`).toBe(true);
      }
    }
  });

  it.each(Object.values(lib.footprints))('footprint $id has its model files', (fp) => {
    if (fp.model.kind !== 'asset') return;
    expect(existsSync(join(appRoot, 'public', `${fp.model.path}.obj`))).toBe(true);
    expect(existsSync(join(appRoot, 'public', `${fp.model.path}.mtl`))).toBe(true);
  });
});

describe('golden corpus', () => {
  const fixture = (name: string) => JSON.parse(readFileSync(join(appRoot, 'fixtures', name), 'utf-8')) as unknown;

  it('v0.1.1 example project: same nets and the same airwires as the Python version', () => {
    const { project, warnings } = loadProject(fixture('v0.1.1-transistor-blinker.legacy.json'), lib);
    expect(warnings).toEqual([]);
    expect(Object.keys(project.layout.placements)).toHaveLength(12);
    expect(Object.keys(project.layout.wires)).toHaveLength(4);

    const netlist = deriveNetlist(project);
    const golden = fixture('v0.1.1-transistor-blinker.airwires.json') as Record<string, [Vec3, Vec3][]>;
    expect(netlist.nets.map((n) => n.name).sort()).toEqual(Object.keys(golden).sort());

    const key = (v: Vec3) => round3(v, 3).join(',');
    const actual: Record<string, string[]> = {};
    for (const w of computeAirwires(project, netlist)) {
      (actual[w.net] ??= []).push([key(w.from.position), key(w.to.position)].sort().join(' | '));
    }
    const expected: Record<string, string[]> = {};
    for (const [net, edges] of Object.entries(golden)) {
      expected[net] = edges.map(([a, b]) => [key(a), key(b)].sort().join(' | '));
    }
    for (const net of Object.keys(expected)) {
      expect((actual[net] ?? []).sort(), net).toEqual(expected[net]!.sort());
    }
  });

  it.each(['v2.0-transistor-blinker.ffp.json'].filter((f) => existsSync(join(appRoot, 'fixtures', f))))('%s loads without warnings', (name) => {
    const { warnings, project } = loadProject(fixture(name), lib);
    expect(warnings).toEqual([]);
    expect(computeAirwires(project).length).toBeGreaterThan(0);
  });
});
