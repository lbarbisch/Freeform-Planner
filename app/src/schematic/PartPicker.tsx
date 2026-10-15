import { useMemo, useState } from 'react';
import { naturalCompare } from '../core';
import { useApp } from '../app/store';
import { SymbolPreview } from './SymbolGraphics';

export function PartPicker({ active, onPick }: { active: string | null; onPick: (partId: string) => void }) {
  const library = useApp((s) => s.library);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const parts = Object.values(library.parts)
      .filter((p) => !q || `${p.id} ${p.name} ${p.description}`.toLowerCase().includes(q))
      .sort((a, b) => naturalCompare(a.name, b.name));
    const isPower = (id: string) => library.symbols[library.parts[id]!.symbolId]?.power;
    return [
      { title: 'Parts', parts: parts.filter((p) => !isPower(p.id)) },
      { title: 'Power', parts: parts.filter((p) => isPower(p.id)) },
    ];
  }, [library, query]);

  return (
    <aside className="side-panel part-picker" aria-label="Part library">
      <input type="search" placeholder="Search parts…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search parts" />
      {groups.map((g) =>
        g.parts.length ? (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <ul>
              {g.parts.map((p) => {
                const symbol = library.symbols[p.symbolId];
                return (
                  <li key={p.id}>
                    <button className={`part-item ${active === p.id ? 'active' : ''}`} onClick={() => onPick(p.id)} title={p.description} data-testid={`part-${p.id}`}>
                      {symbol && <SymbolPreview symbol={symbol} size={34} />}
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.description || `${p.variants.length} footprint${p.variants.length === 1 ? '' : 's'}`}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}
    </aside>
  );
}
