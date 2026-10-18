/** Deterministic ids: prefix + lowest free number. Keeps files diff-friendly and tests stable. */
export function nextId(prefix: string, existing: Record<string, unknown>): string {
  let n = Object.keys(existing).length + 1;
  while (`${prefix}${n}` in existing) n++;
  return `${prefix}${n}`;
}
