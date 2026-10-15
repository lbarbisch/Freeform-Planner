import { useMemo } from 'react';
import { autoPinMap, naturalCompare, upsert, validatePart, type PartDef, type PartVariant } from '../core';
import { applyLibrary, useApp } from '../app/store';
import { Issues, TextField } from '../app/fields';
import { SymbolPreview } from '../schematic/SymbolGraphics';

export function PartEditor({ part }: { part: PartDef }) {
  const library = useApp((s) => s.library);
  const issues = useMemo(() => validatePart(library, part), [library, part]);
  const symbol = library.symbols[part.symbolId];
  const footprintIds = useMemo(() => Object.keys(library.footprints).sort(naturalCompare), [library.footprints]);
  const symbolIds = useMemo(() => Object.keys(library.symbols).sort(naturalCompare), [library.symbols]);

  const update = (patch: Partial<PartDef>) => applyLibrary((l) => upsert(l, 'parts', { ...part, ...patch }));
  const setVariant = (i: number, v: PartVariant) => update({ variants: part.variants.map((x, j) => (j === i ? v : x)) });
  const moveVariant = (i: number, d: -1 | 1) => {
    const variants = [...part.variants];
    const [v] = variants.splice(i, 1);
    variants.splice(i + d, 0, v!);
    update({ variants });
  };

  return (
    <div className="part-editor" data-testid="part-editor">
      <section className="form-grid">
        <TextField label="Name" value={part.name} onCommit={(name) => update({ name })} testId="part-name" />
        <TextField label="Default value" value={part.defaultValue} onCommit={(defaultValue) => update({ defaultValue })} testId="part-value" />
        <TextField label="Description" value={part.description} onCommit={(description) => update({ description })} />
        <label className="field">
          <span>Symbol</span>
          <select value={part.symbolId} onChange={(e) => update({ symbolId: e.target.value })} data-testid="part-symbol">
            {!symbol && <option value={part.symbolId}>(missing) {part.symbolId}</option>}
            {symbolIds.map((id) => (
              <option key={id} value={id}>
                {library.symbols[id]!.name}
              </option>
            ))}
          </select>
        </label>
        {symbol && <SymbolPreview symbol={symbol} size={96} />}
      </section>

      <h3>Footprint variants</h3>
      <p className="muted">The first variant is used when the part is placed; F cycles through them in the 3D layout.</p>
      {part.variants.map((v, i) => {
        const fp = library.footprints[v.footprintId];
        return (
          <section key={i} className="variant" data-testid={`variant-${i}`}>
            <header>
              <strong>{i + 1}.</strong>
              <select
                value={v.footprintId}
                onChange={(e) => {
                  const next = library.footprints[e.target.value];
                  setVariant(i, { footprintId: e.target.value, pinMap: symbol && next ? autoPinMap(symbol, next) : {} });
                }}
                aria-label="Footprint"
              >
                {!fp && <option value={v.footprintId}>(missing) {v.footprintId}</option>}
                {footprintIds.map((id) => (
                  <option key={id} value={id}>
                    {library.footprints[id]!.name}
                  </option>
                ))}
              </select>
              <button onClick={() => symbol && fp && setVariant(i, { ...v, pinMap: autoPinMap(symbol, fp) })} disabled={!symbol || !fp}>
                Map by number
              </button>
              <button className="icon" onClick={() => moveVariant(i, -1)} disabled={i === 0} aria-label="Move up">
                ↑
              </button>
              <button className="icon" onClick={() => moveVariant(i, 1)} disabled={i === part.variants.length - 1} aria-label="Move down">
                ↓
              </button>
              <button className="icon" onClick={() => update({ variants: part.variants.filter((_, j) => j !== i) })} aria-label="Remove variant">
                ×
              </button>
            </header>
            {symbol && fp && (
              <table className="mini">
                <thead>
                  <tr>
                    <th>Symbol pin</th>
                    <th>Footprint pin</th>
                  </tr>
                </thead>
                <tbody>
                  {symbol.pins.map((sp) => (
                    <tr key={sp.number}>
                      <td>
                        {sp.number} {sp.name && <span className="muted">({sp.name})</span>}
                      </td>
                      <td>
                        <select
                          value={v.pinMap[sp.number] ?? ''}
                          onChange={(e) => {
                            const pinMap = { ...v.pinMap };
                            if (e.target.value) pinMap[sp.number] = e.target.value;
                            else delete pinMap[sp.number];
                            setVariant(i, { ...v, pinMap });
                          }}
                          aria-label={`Footprint pin for symbol pin ${sp.number}`}
                        >
                          <option value="">–</option>
                          {fp.pins.map((p) => (
                            <option key={p.number} value={p.number}>
                              {p.number}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      <button
        onClick={() => {
          const fpId = footprintIds.find((id) => !library.footprints[id]!.isWire) ?? footprintIds[0];
          const fp = fpId ? library.footprints[fpId] : undefined;
          if (fpId) update({ variants: [...part.variants, { footprintId: fpId, pinMap: symbol && fp ? autoPinMap(symbol, fp) : {} }] });
        }}
        data-testid="add-variant"
      >
        Add footprint variant
      </button>
      <h3>Check</h3>
      <Issues issues={issues} />
    </div>
  );
}
