import { useId, useRef, useState } from 'react';

/** Local draft of a value that resets whenever the value changes from outside. */
function useDraft<T>(value: T, toDraft: (v: T) => string) {
  const [draft, setDraft] = useState(() => toDraft(value));
  const [shown, setShown] = useState(value);
  if (!Object.is(shown, value)) {
    setShown(value);
    setDraft(toDraft(value));
  }
  return [draft, setDraft] as const;
}

/** Text input that commits on blur / Enter, so typing produces a single undo step. `onCommit`
 * may return false to reject the text, which restores the current value. */
export function TextField({ label, value, onCommit, testId, inputRef, placeholder, suggestions }: { label: string; value: string; onCommit: (v: string) => void | boolean; testId?: string; inputRef?: React.RefObject<HTMLInputElement | null>; placeholder?: string; suggestions?: string[] }) {
  const listId = useId();
  const [draft, setDraft] = useDraft(value, String);
  const cancelled = useRef(false);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        list={suggestions ? listId : undefined}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        // the only place that commits, so Enter + blur cannot create two undo steps
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            setDraft(value);
          } else if (draft !== value && onCommit(draft) === false) setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </label>
  );
}

/** Numeric input; invalid text reverts to the last valid value. */
export function NumberField({ label, value, onCommit, step = 0.1, testId, compact }: { label: string; value: number; onCommit: (v: number) => void; step?: number; testId?: string; compact?: boolean }) {
  const [draft, setDraft] = useDraft(value, String);
  const commit = () => {
    const n = Number(draft.replace(',', '.'));
    if (draft.trim() === '' || !Number.isFinite(n)) setDraft(String(value));
    else if (n !== value) onCommit(n);
  };
  return (
    <label className={`field ${compact ? 'compact' : ''}`}>
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = Number(draft) || 0;
            const next = Math.round((n + (e.key === 'ArrowUp' ? step : -step)) * 1e6) / 1e6;
            setDraft(String(next));
            onCommit(next);
          }
        }}
      />
    </label>
  );
}

export function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Issues({ issues }: { issues: string[] }) {
  if (!issues.length) return <p className="ok">✓ No problems found</p>;
  return (
    <ul className="issues" data-testid="issues">
      {issues.map((i) => (
        <li key={i}>⚠ {i}</li>
      ))}
    </ul>
  );
}
