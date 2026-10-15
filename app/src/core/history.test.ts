import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, commit, createHistory, HISTORY_LIMIT, redo, seal, undo } from './history';

describe('history', () => {
  it('undoes and redoes', () => {
    let h = createHistory(0);
    h = commit(h, 1);
    h = commit(h, 2);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(redo(h)).toBe(h);
    h = undo(undo(h));
    expect(h.present).toBe(0);
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
  });

  it('drops the redo branch on a new commit', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c');
    h = commit(undo(h), 'd');
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe('b');
  });

  it('ignores no-op commits', () => {
    const h = createHistory({ x: 1 });
    expect(commit(h, h.present)).toBe(h);
  });

  it('coalesces commits with the same key until sealed', () => {
    let h = createHistory(0);
    h = commit(h, 1, 'drag');
    h = commit(h, 2, 'drag');
    h = commit(h, 3, 'drag');
    expect(h.past).toEqual([0]);
    h = seal(h);
    expect(seal(h)).toBe(h);
    h = commit(h, 4, 'drag');
    expect(h.past).toEqual([0, 3]);
  });

  it('limits the number of steps', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
