/** Keeps the shipped example project in sync with the file format.
 *
 * The example is hand-made: it only has to load and save back unchanged. Legacy migration is
 * covered by src/library/library.test.ts (v0.1.1 airwires, v2.0 golden fixture).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProject, saveProjectText } from '../src/core';
import { builtinLibrary } from '../src/library/builtin';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('example project', () => {
  const examplePath = join(root, 'public', 'examples', 'transistor-blinker.ffp.json');

  it('round-trips unchanged through load and save', () => {
    const text = readFileSync(examplePath, 'utf-8');
    const { project, warnings } = loadProject(JSON.parse(text) as unknown, builtinLibrary);
    expect(warnings).toEqual([]);
    expect(saveProjectText(project)).toBe(text);
  });
});
