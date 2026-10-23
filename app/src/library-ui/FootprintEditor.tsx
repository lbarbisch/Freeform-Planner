import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { naturalCompare, round, upsert, validateFootprint, type FootprintDef, type FootprintPin, type ModelSource, type Vec3 } from '../core';
import { applyLibrary, setState, useApp } from '../app/store';
import { CheckField, Issues, NumberField, TextField } from '../app/fields';
import { isTypingTarget } from '../app/keyboard';
import { builtinLibrary } from '../library/builtin';
import { eulerDeg, quatFromEulerDeg } from '../layout3d/models';
import { attachSpaceMouse, spaceMouseMenu } from '../layout3d/spaceMouse';
import { FootprintPreview, type PreviewSelection } from './FootprintPreview';

const AXES = ['X', 'Y', 'Z'] as const;

export function FootprintEditor({ footprint }: { footprint: FootprintDef }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<FootprintPreview | null>(null);
  const library = useApp((s) => s.library);
  const spaceMouse = useApp((s) => s.spaceMouse);
  const [addByClick, setAddByClick] = useState(false);
  const [selection, setSelection] = useState<PreviewSelection>(null);
  const [modelMode, setModelMode] = useState<'translate' | 'rotate'>('translate');
  // one undo step per gizmo drag
  const dragKey = useRef<string | null>(null);
  const issues = useMemo(() => validateFootprint(footprint), [footprint]);
  const selectedPin = selection?.kind === 'pin' ? selection.index : null;
  // latest footprint for callbacks registered with the Three.js preview
  const fpRef = useRef(footprint);
  useLayoutEffect(() => {
    fpRef.current = footprint;
  });

  // models shipped with the app; importing new ones is not offered
  const models = useMemo(() => {
    const paths = [builtinLibrary, library].flatMap((l) => Object.values(l.footprints).map((f) => (f.model.kind === 'asset' ? f.model.path : null)));
    return [...new Set(paths.filter((p) => p !== null))].sort(naturalCompare);
  }, [library]);

  const update = (patch: Partial<FootprintDef>) => applyLibrary((l) => upsert(l, 'footprints', { ...fpRef.current, ...patch }));

  useEffect(() => {
    const preview = new FootprintPreview(hostRef.current!);
    previewRef.current = preview;
    preview.onSelect = setSelection;
    preview.onPinMove = (index, position) => {
      dragKey.current ??= `fppin:${performance.now()}`;
      const fp = fpRef.current;
      applyLibrary((l) => upsert(l, 'footprints', { ...fp, pins: fp.pins.map((p, j) => (j === index ? { ...p, position } : p)) }), dragKey.current);
    };
    preview.onModelMove = (modelOffset, modelRotation) => {
      dragKey.current ??= `fpmodel:${performance.now()}`;
      applyLibrary((l) => upsert(l, 'footprints', { ...fpRef.current, modelOffset, modelRotation }), dragKey.current);
    };
    preview.onMoveEnd = () => {
      dragKey.current = null;
    };
    const ro = new ResizeObserver(() => preview.resize());
    ro.observe(hostRef.current!);
    const detachSpaceMouse = attachSpaceMouse({ camera: preview.camera, orbit: preview.controls, invalidate: () => preview.render(), frameAll: () => preview.frame() });
    return () => {
      ro.disconnect();
      detachSpaceMouse();
      preview.dispose();
    };
  }, [footprint.id]);

  useEffect(() => {
    previewRef.current?.setSelection(selection);
  }, [selection, footprint.id]);

  useEffect(() => {
    previewRef.current?.setModelMode(modelMode);
  }, [modelMode, footprint.id]);

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
          setSelection({ kind: 'pin', index: fp.pins.length });
        }
      : null;
  }, [addByClick, footprint.id]);

  // app bar menus and keys: M / R pick the model gizmo, Home zooms to fit
  useEffect(() => {
    const move = () => setModelMode('translate');
    const rotate = () => setModelMode('rotate');
    const fit = () => previewRef.current?.frame();
    setState({
      viewMenus: {
        tools: [
          { label: 'Move model', shortcut: 'M', active: modelMode === 'translate', run: move },
          { label: 'Rotate model', shortcut: 'R', active: modelMode === 'rotate', run: rotate },
        ],
        view: [{ label: 'Zoom to fit', shortcut: 'Home', run: fit }, ...spaceMouseMenu(spaceMouse)],
      },
    });
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const actions: Record<string, () => void> = { m: move, r: rotate, home: fit, escape: () => setSelection(null) };
      const action = actions[e.key.toLowerCase()];
      if (!action) return;
      action();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modelMode, spaceMouse]);
  useEffect(() => () => setState({ viewMenus: null }), []);

  const setPin = (i: number, patch: Partial<FootprintPin>) => update({ pins: footprint.pins.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setPinCoord = (i: number, axis: 0 | 1 | 2, v: number) => {
    const position = [...footprint.pins[i]!.position] as Vec3;
    position[axis] = v;
    setPin(i, { position });
  };
  const removePin = (i: number) => {
    update({ pins: footprint.pins.filter((_, j) => j !== i) });
    setSelection((s) => {
      if (s?.kind !== 'pin') return s;
      if (s.index === i) return null;
      return s.index > i ? { kind: 'pin', index: s.index - 1 } : s;
    });
  };
  const setModel = (value: string) => {
    if (value === 'embedded') return;
    const model: ModelSource = value === 'none' ? { kind: 'none' } : { kind: 'asset', path: value };
    update({ model });
  };

  const rotation = eulerDeg(footprint.modelRotation);
  const modelValue = footprint.model.kind === 'asset' ? footprint.model.path : footprint.model.kind;

  return (
    <div className="editor-split">
      <div className="editor-canvas no-toolbar">
        <div className="canvas-host" ref={hostRef} data-testid="footprint-canvas" />
      </div>
      <aside className="side-panel">
        <h3>Footprint</h3>
        <TextField label="Name" value={footprint.name} onCommit={(name) => update({ name })} testId="footprint-name" />
        <label className="field">
          <span>3D model</span>
          <select value={modelValue} onChange={(e) => setModel(e.target.value)} data-testid="footprint-model">
            <option value="none">None (placeholder box)</option>
            {footprint.model.kind === 'embedded' && <option value="embedded">Imported model (stored in the library)</option>}
            {footprint.model.kind === 'asset' && !models.includes(footprint.model.path) && <option value={footprint.model.path}>{footprint.model.path} (missing)</option>}
            {models.map((path) => (
              <option key={path} value={path}>
                {path.replace(/^models\//, '')}
              </option>
            ))}
          </select>
        </label>
        <h4>Model position (mm)</h4>
        <div className="row transform-row">
          {AXES.map((axis, i) => (
            <NumberField
              key={axis}
              compact
              label={axis}
              value={footprint.modelOffset[i]!}
              testId={`model-offset-${axis.toLowerCase()}`}
              onCommit={(v) => update({ modelOffset: footprint.modelOffset.map((c, j) => (j === i ? v : c)) as Vec3 })}
            />
          ))}
        </div>
        <h4>Model rotation (°)</h4>
        <div className="row transform-row">
          {AXES.map((axis, i) => (
            <NumberField
              key={axis}
              compact
              step={90}
              label={axis}
              value={rotation[i]!}
              testId={`model-rotation-${axis.toLowerCase()}`}
              onCommit={(v) => update({ modelRotation: quatFromEulerDeg(rotation.map((c, j) => (j === i ? v : c)) as Vec3).map((q) => round(q, 6)) as FootprintDef['modelRotation'] })}
            />
          ))}
        </div>
        <NumberField label="Model scale" value={footprint.modelScale} onCommit={(v) => v > 0 && update({ modelScale: v })} />
        <CheckField label="Wire (layout only)" value={footprint.isWire} onChange={(isWire) => update({ isWire })} />
        <p className="muted">Click the model or a pin to select it, then drag the gizmo. M / R switch the model gizmo between move and rotate.</p>
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
              <tr
                key={i}
                className={selectedPin === i ? 'selected-row' : ''}
                onFocus={() => setSelection({ kind: 'pin', index: i })}
                onClick={() => setSelection({ kind: 'pin', index: i })}
                data-testid={`fp-pin-row-${i}`}
              >
                <td>
                  <TextField
                    label=""
                    value={pin.number}
                    onCommit={(number) => {
                      if (!number.trim()) return false;
                      setPin(i, { number: number.trim() });
                    }}
                  />
                </td>
                {([0, 1, 2] as const).map((axis) => (
                  <td key={axis}>
                    <NumberField compact label="" value={pin.position[axis]} onCommit={(v) => setPinCoord(i, axis, v)} />
                  </td>
                ))}
                <td>
                  <button
                    className="icon"
                    aria-label={`Remove pin ${pin.number}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removePin(i);
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="actions add-pin-row">
          <button
            onClick={() => {
              const numbers = footprint.pins.map((x) => Number(x.number)).filter(Number.isFinite);
              update({ pins: [...footprint.pins, { number: String((numbers.length ? Math.max(...numbers) : 0) + 1), position: [0, 0, 0] }] });
              setSelection({ kind: 'pin', index: footprint.pins.length });
            }}
          >
            Add pin
          </button>
          <CheckField label="Add by clicking on the model" value={addByClick} onChange={setAddByClick} />
        </div>
        <h4>Check</h4>
        <Issues issues={issues} />
      </aside>
    </div>
  );
}
