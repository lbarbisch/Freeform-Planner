/** Snapshot based undo/redo. Projects are immutable, so a snapshot is just a reference and
 * unchanged parts are shared between snapshots. */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** consecutive commits with the same key (e.g. dragging one part) merge into one undo step */
  lastKey: string | null;
}

export const HISTORY_LIMIT = 200;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null };
}

export function commit<T>(h: History<T>, next: T, coalesceKey: string | null = null): History<T> {
  if (next === h.present) return h;
  if (coalesceKey !== null && coalesceKey === h.lastKey && h.past.length > 0) {
    return { ...h, present: next, future: [], lastKey: coalesceKey };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [], lastKey: coalesceKey };
}

/** Ends the current coalescing run so the next commit becomes its own undo step. */
export function seal<T>(h: History<T>): History<T> {
  return h.lastKey === null ? h : { ...h, lastKey: null };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], lastKey: null };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1), lastKey: null };
}

export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;
