import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { quatFromAxisAngle, quatMultiply, quatNormalize, round, upsert, validateFootprint, type FootprintDef, type FootprintPin, type Vec3 } from '../core';
import { applyLibrary, notify } from '../app/store';
import { CheckField, Issues, NumberField, TextField } from '../app/fields';
import { FootprintPreview } from './FootprintPreview';

/** Reads selected .obj (and optional .mtl) files. */
async function readModelFiles(files: FileList): Promise<{ obj: string; mtl: string | null } | null> {
  const list = [...files];
  const obj = list.find((f) => f.name.toLowerCase().endsWith('.obj'));
  if (!obj) return null;
  const mtl = list.find((f) => f.name.toLowerCase().endsWith('.mtl'));
  return { obj: await obj.text(), mtl: mtl ? await mtl.text() : null };
}

export function FootprintEditor({ footprint }: { footprint: FootprintDef }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<FootprintPreview | null>(null);
  const [addByClick, setAddByClick] = useState(false);
  const issues = useMemo(() => validateFootprint(footprint), [footprint]);
  // latest footprint for callbacks registered with the Three.js preview
  const fpRef = useRef(footprint);
  useLayoutEffect(() => {
    fpRef.current = footprint;
  });

  const update = (patch: Partial<FootprintDef>) => applyLibrary((l) => upsert(l, 'footprints', { ...fpRef.current, ...patch }));

  useEffect(() => {
    const preview = new FootprintPreview(hostRef.current!);
    previewRef.current = preview;
    const ro = new ResizeObserver(() => preview.resize());
    ro.observe(hostRef.current!);
    return () => {
      ro.disconnect();
      preview.dispose();
    };
  }, [footprint.id]);

  useEffect(() => {
    previewRef.current?.show(footprint);
  }, [footprint]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.onPick = addByClick
      ? (p: Vec3) => {
          const fp = fpRef.current;
          const numbers = fp.pins.map((x) => Number(x.number)).filter(Number.isFinite);
          const number = String((numbers.length ? Math.max(...numbers) : 0) + 1);
          applyLibrary((l) => upsert(l, 'footprints', { ...fp, pins: [...fp.pins, { number, position: p }] }));
        }
      : null;
  }, [addByClick, footprint.id]);

  const setPin = (i: number, patch: Partial<FootprintPin>) => update({ pins: footprint.pins.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setPinCoord = (i: number, axis: 0 | 1 | 2, v: number) => {
    const position = [...footprint.pins[i]!.position] as Vec3;
    position[axis] = v;
    setPin(i, { position });
  };
  const turn = (axis: Vec3) => update({ modelRotation: quatNormalize(quatMultiply(quatFromAxisAngle(axis, 90), footprint.modelRotation)).map((v) => round(v)) as FootprintDef['modelRotation'] });

  return (
    <div className="editor-split">
      <div className="editor-canvas">
        <div className="toolbar" role="toolbar" aria-label="Footprint tools">
          <label className="button-like">
            Import model…
            <input
              type="file"
              accept=".obj,.mtl"
              multiple
              hidden
              data-testid="model-input"
              onChange={async (e) => {
                const files = e.target.files;
                if (!files) return;
                const model = await readModelFiles(files);
                e.target.value = '';
                if (!model) return notify('error', 'Please choose an .obj file (and optionally its .mtl file).');
                update({ model: { kind: 'embedded', obj: model.obj, mtl: model.mtl } });
                notify('info', model.mtl ? 'Model and materials imported.' : 'Model imported (no .mtl file, default material).');
              }}
            />
          </label>
          <button onClick={() => turn([1, 0, 0])}>Turn X 90°</button>
          <button onClick={() => turn([0, 1, 0])}>Turn Y 90°</button>
          <button onClick={() => turn([0, 0, 1])}>Turn Z 90°</button>
          <button onClick={() => update({ modelRotation: [0, 0, 0, 1] })}>Reset turn</button>
          <span className="sep" />
          <button className={addByClick ? 'active' : ''} onClick={() => setAddByClick((v) => !v)} title="Click on the model surface to add pin anchors">
            Add pins by clicking
          </button>
          <button onClick={() => previewRef.current?.frame()}>Frame</button>
        </div>
        <div className="canvas-host" ref={hostRef} data-testid="footprint-canvas" />
      </div>
      <aside className="side-panel">
        <h3>Footprint</h3>
        <TextField label="Name" value={footprint.name} onCommit={(name) => update({ name })} testId="footprint-name" />
        <p className="muted">
          Model:{' '}
          {footprint.model.kind === 'asset' ? `built-in (${footprint.model.path})` : footprint.model.kind === 'embedded' ? 'imported, stored in the library' : 'none (placeholder box)'}
        </p>
        <div className="row">
          <NumberField compact label="Offset X" value={footprint.modelOffset[0]} onCommit={(v) => update({ modelOffset: [v, footprint.modelOffset[1], footprint.modelOffset[2]] })} />
          <NumberField compact label="Y" value={footprint.modelOffset[1]} onCommit={(v) => update({ modelOffset: [footprint.modelOffset[0], v, footprint.modelOffset[2]] })} />
          <NumberField compact label="Z" value={footprint.modelOffset[2]} onCommit={(v) => update({ modelOffset: [footprint.modelOffset[0], footprint.modelOffset[1], v] })} />
        </div>
        <NumberField label="Model scale" value={footprint.modelScale} onCommit={(v) => v > 0 && update({ modelScale: v })} />
        <CheckField label="Freeform wire (layout only)" value={footprint.isWire} onChange={(isWire) => update({ isWire })} />
        <h4>Pins (mm)</h4>
        <table className="pin-table" data-testid="footprint-pins">
          <thead>
            <tr>
              <th>#</th>
              <th>X</th>
              <th>Y</th>
              <th>Z</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {footprint.pins.map((pin, i) => (
              <tr key={i}>
                <td>
                  <TextField label="" value={pin.number} onCommit={(number) => number.trim() && setPin(i, { number: number.trim() })} />
                </td>
                {([0, 1, 2] as const).map((axis) => (
                  <td key={axis}>
                    <NumberField compact label="" value={pin.position[axis]} onCommit={(v) => setPinCoord(i, axis, v)} />
                  </td>
                ))}
                <td>
                  <button className="icon" aria-label={`Remove pin ${pin.number}`} onClick={() => update({ pins: footprint.pins.filter((_, j) => j !== i) })}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            const numbers = footprint.pins.map((x) => Number(x.number)).filter(Number.isFinite);
            update({ pins: [...footprint.pins, { number: String((numbers.length ? Math.max(...numbers) : 0) + 1), position: [0, 0, 0] }] });
          }}
        >
          Add pin
        </button>
        <h4>Check</h4>
        <Issues issues={issues} />
      </aside>
    </div>
  );
}
