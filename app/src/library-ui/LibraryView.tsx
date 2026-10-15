import { useEffect, useMemo, useState } from 'react';
import {
  duplicateItem,
  loadLibrary,
  mergeLibraries,
  naturalCompare,
  newFootprint,
  newPart,
  newSymbol,
  removeItem,
  saveLibraryText,
  updateFromLibrary,
  upsert,
  validateFootprint,
  validatePart,
  validateSymbol,
  type LibraryKind,
} from '../core';
import { apply, applyLibrary, getState, notify, redoLibrary, replaceLibrary, undoLibrary, useApp } from '../app/store';
import { pickTextFile, saveTextFile } from '../app/persistence';
import { builtinLibrary } from '../library/builtin';
import { isTypingTarget } from '../app/keyboard';
import { SymbolPreview } from '../schematic/SymbolGraphics';
import { FootprintEditor } from './FootprintEditor';
import { PartEditor } from './PartEditor';
import { SymbolEditor } from './SymbolEditor';

const TABS: { kind: LibraryKind; label: string }[] = [
  { kind: 'parts', label: 'Parts' },
  { kind: 'symbols', label: 'Symbols' },
  { kind: 'footprints', label: 'Footprints' },
];

export function LibraryView() {
  const library = useApp((s) => s.library);
  const canUndo = useApp((s) => s.libraryHistory.past.length > 0);
  const canRedo = useApp((s) => s.libraryHistory.future.length > 0);
  const [kind, setKind] = useState<LibraryKind>('parts');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(library[kind] as Record<string, { id: string; name: string }>)
      .filter((i) => !q || `${i.id} ${i.name}`.toLowerCase().includes(q))
      .sort((a, b) => naturalCompare(a.name, b.name));
  }, [library, kind, query]);

  const issueCount = (id: string): number => {
    if (kind === 'parts') return validatePart(library, library.parts[id]!).length;
    if (kind === 'symbols') return validateSymbol(library.symbols[id]!).length;
    return validateFootprint(library.footprints[id]!).length;
  };

  const current = selectedId !== null && selectedId in library[kind];

  // library undo/redo while this view is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || !(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undoLibrary();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) redoLibrary();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const create = () => {
    const lib = getState().library;
    const item = kind === 'parts' ? newPart(lib) : kind === 'symbols' ? newSymbol(lib) : newFootprint(lib);
    applyLibrary((l) => upsert(l, kind, item as never));
    setSelectedId(item.id);
  };

  const duplicate = () => {
    if (!selectedId) return;
    const r = duplicateItem(getState().library, kind, selectedId);
    if (r.id) {
      applyLibrary(() => r.library);
      setSelectedId(r.id);
    }
  };

  const remove = () => {
    if (!selectedId) return;
    const r = removeItem(getState().library, kind, selectedId);
    if (r.error) return notify('error', `Cannot delete: ${r.error}`);
    applyLibrary(() => r.library);
    setSelectedId(null);
  };

  const importLibrary = async () => {
    const file = await pickTextFile('.json,application/json');
    if (!file) return;
    try {
      const other = loadLibrary(JSON.parse(file.text));
      const r = mergeLibraries(getState().library, other, true);
      applyLibrary(() => r.library);
      notify('info', `Imported ${r.added} items from ${file.name}.`);
    } catch (e) {
      notify('error', `Could not import ${file.name}: ${(e as Error).message}`);
    }
  };

  const exportLibrary = async () => {
    const lib = getState().library;
    await saveTextFile(`${lib.name.replace(/[^\w-]+/g, '_') || 'library'}.library.json`, saveLibraryText(lib), 'application/json', '.json');
  };

  const resetLibrary = () => {
    if (!window.confirm('Replace the working library with the built-in library? Your own parts are lost unless you exported them.')) return;
    replaceLibrary(builtinLibrary);
    setSelectedId(null);
    notify('info', 'Library reset to the built-in library.');
  };

  const updateProject = () => {
    apply((p) => updateFromLibrary(p, getState().library));
    notify('info', 'Parts in the project were updated from the library.');
  };

  return (
    <div className="library-view">
      <div className="toolbar" role="toolbar" aria-label="Library">
        <button onClick={undoLibrary} disabled={!canUndo} title="Undo library change (Ctrl+Z)">
          Undo
        </button>
        <button onClick={redoLibrary} disabled={!canRedo} title="Redo library change (Ctrl+Y)">
          Redo
        </button>
        <span className="sep" />
        <button onClick={importLibrary}>Import library…</button>
        <button onClick={exportLibrary}>Export library…</button>
        <button onClick={resetLibrary}>Reset to built-in</button>
        <span className="sep" />
        <button onClick={updateProject} title="Replace the part copies stored in the open project with the versions from this library" data-testid="update-project">
          Update project from library
        </button>
      </div>
      <div className="library-body">
        <aside className="side-panel library-list">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.kind}
                role="tab"
                aria-selected={kind === t.kind}
                className={kind === t.kind ? 'active' : ''}
                onClick={() => {
                  setKind(t.kind);
                  setSelectedId(null);
                }}
              >
                {t.label} ({Object.keys(library[t.kind]).length})
              </button>
            ))}
          </div>
          <input type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search library" />
          <div className="actions">
            <button onClick={create} data-testid="lib-new">
              New
            </button>
            <button onClick={duplicate} disabled={!selectedId}>
              Duplicate
            </button>
            <button onClick={remove} disabled={!selectedId}>
              Delete
            </button>
          </div>
          <ul>
            {items.map((item) => {
              const issues = issueCount(item.id);
              const symbol = kind === 'symbols' ? library.symbols[item.id] : kind === 'parts' ? library.symbols[library.parts[item.id]!.symbolId] : undefined;
              return (
                <li key={item.id}>
                  <button className={`part-item ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)} data-testid={`lib-item-${item.id}`}>
                    {symbol && <SymbolPreview symbol={symbol} size={30} />}
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.id}
                        {issues > 0 && <span className="warning"> · ⚠ {issues}</span>}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <main className="library-editor">
          {!current && <p className="empty-hint">Select an item on the left, or create a new one.</p>}
          {current && kind === 'symbols' && <SymbolEditor key={selectedId} symbol={library.symbols[selectedId!]!} />}
          {current && kind === 'footprints' && <FootprintEditor key={selectedId} footprint={library.footprints[selectedId!]!} />}
          {current && kind === 'parts' && <PartEditor key={selectedId} part={library.parts[selectedId!]!} />}
        </main>
      </div>
    </div>
  );
}
