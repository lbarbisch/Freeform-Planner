/** Keeps the shipped example project and the 2.0 golden fixture in sync with the migration.
 *
 *   UPDATE_EXAMPLES=1 npx vitest run tools   regenerates the files
 *   npx vitest run                           checks that they are up to date
 *
 * The v2.0 fixture is only written when missing: once released, a golden file must never change.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProject, saveProjectText } from '../src/core';
import { builtinLibrary } from '../src/library/builtin';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const update = process.env.UPDATE_EXAMPLES === '1';

function generate(): string {
  const legacy = JSON.parse(readFileSync(join(root, 'fixtures', 'v0.1.1-transistor-blinker.legacy.json'), 'utf-8')) as unknown;
  const { project } = loadProject(legacy, builtinLibrary);
  return saveProjectText({ ...project, name: 'Transistor blinker' });
}

describe('example project', () => {
  const examplePath = join(root, 'public', 'examples', 'transistor-blinker.ffp.json');
  const goldenPath = join(root, 'fixtures', 'v2.0-transistor-blinker.ffp.json');

  it('is up to date', () => {
    const text = generate();
    if (update) {
      mkdirSync(dirname(examplePath), { recursive: true });
      writeFileSync(examplePath, text);
      if (!existsSync(goldenPath)) writeFileSync(goldenPath, text);
    }
    expect(readFileSync(examplePath, 'utf-8')).toBe(text);
  });
});
