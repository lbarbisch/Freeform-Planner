import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { deriveNetlist } from '../core';
import { SchematicView } from '../schematic/SchematicView';

// Three.js is only needed by these views; loading them on demand keeps the first load small
const LayoutView = lazy(() => import('../layout3d/LayoutView').then((m) => ({ default: m.LayoutView })));
const LibraryView = lazy(() => import('../library-ui/LibraryView').then((m) => ({ default: m.LibraryView })));
import { Modal } from './Dialog';
import { newProject, openExample, openProject, saveProject } from './fileActions';
import { isTypingTarget } from './keyboard';
import { defaultSettings, keyLabels, type Settings } from './settings';
import { dismissNotice, isDirty, redo, setState, setView, undo, useApp, type View } from './store';

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'schematic', label: 'Schematic', key: 'F1' },
  { id: 'layout', label: '3D Layout', key: 'F2' },
  { id: 'library', label: 'Library', key: 'F3' },
];

export function App() {
  const view = useApp((s) => s.view);
  const [dialog, setDialog] = useState<'help' | 'settings' | null>(null);
  const dirty = useApp(isDirty);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const viewKey = VIEWS.find((v) => v.key === e.key);
      if (viewKey) {
        setView(viewKey.id);
        e.preventDefault();
        return;
      }
      if (!mod) {
        if (e.key === '?' && !isTypingTarget(e.target)) setDialog('help');
        return;
      }
      if (k === 's') void saveProject(e.shiftKey);
      else if (k === 'o') void openProject();
      else if (isTypingTarget(e.target)) return;
      else if (k === 'z' && !e.shiftKey) undo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // warn before closing with unsaved work (autosave keeps it, but be explicit)
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Freeform-Planner</span>
        <Menu label="File">
          <button onClick={newProject}>New</button>
          <button onClick={() => void openProject()} data-testid="menu-open">
            Open… <kbd>Ctrl+O</kbd>
          </button>
          <button onClick={() => void openExample()} data-testid="menu-example">
            Open example
          </button>
          <button onClick={() => void saveProject()} data-testid="menu-save">
            Save <kbd>Ctrl+S</kbd>
          </button>
          <button onClick={() => void saveProject(true)}>
            Save as… <kbd>Ctrl+Shift+S</kbd>
          </button>
        </Menu>
        <Menu label="Edit">
          <button onClick={undo}>
            Undo <kbd>Ctrl+Z</kbd>
          </button>
          <button onClick={redo}>
            Redo <kbd>Ctrl+Y</kbd>
          </button>
          <button onClick={() => setDialog('settings')}>Settings…</button>
        </Menu>
        <nav className="view-tabs" role="tablist" aria-label="Views">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)} title={v.key}>
              {v.label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <button className="help-button" onClick={() => setDialog('help')} aria-label="Help">
          ?
        </button>
      </header>
      <main className="workspace">
        {view === 'schematic' && <SchematicView />}
        <Suspense fallback={<p className="empty-hint">Loading…</p>}>
          {view === 'layout' && <LayoutView />}
          {view === 'library' && <LibraryView />}
        </Suspense>
      </main>
      <StatusBar />
      <Notices />
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={open ? 'active' : ''} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className="menu-items" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function StatusBar() {
  const project = useApp((s) => s.history.present);
  const fileName = useApp((s) => s.fileName);
  const dirty = useApp(isDirty);
  const nets = deriveNetlist(project).nets.length;
  return (
    <footer className="statusbar" data-testid="statusbar">
      <span data-testid="file-name">
        {fileName ?? project.name}
        {dirty ? ' •' : ''}
      </span>
      <span>
        {Object.keys(project.schematic.instances).length} parts · {nets} nets · {Object.keys(project.layout.wires).length} freeform wires
      </span>
    </footer>
  );
}

function Notices() {
  const notices = useApp((s) => s.notices);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
          <span>{n.text}</span>
          <button className="icon" onClick={() => dismissNotice(n.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const keys = useApp((s) => s.settings.keys);
  const k = (key: string) => <kbd>{key.toUpperCase()}</kbd>;
  return (
    <Modal title="Help" onClose={onClose} wide>
      <div className="help">
        <section>
          <h3>Workflow</h3>
          <ol>
            <li>Draw the circuit in the <b>Schematic</b> (F1): pick parts on the left, connect pins with wires or net labels.</li>
            <li>Arrange the parts in the <b>3D Layout</b> (F2). New parts appear on a staging grid; yellow airwires show what still has to be connected.</li>
            <li>Create your own symbols, footprints and parts in the <b>Library</b> (F3).</li>
            <li>Save with Ctrl+S. Unsaved work is also kept in the browser automatically.</li>
          </ol>
        </section>
        <section>
          <h3>Schematic</h3>
          <ul>
            <li>{k('W')} wire tool · {k('L')} net label · {k('Esc')} back to select</li>
            <li>{k('R')} rotate · {k('X')} mirror · {k('Del')} delete · {k('/')} wire corner direction</li>
            <li>Drag to move (connected wires follow) · Shift-click to add to the selection · drag on empty space to box-select</li>
            <li>Right or middle drag to pan · wheel to zoom · {k('Home')} fit</li>
            <li>Double-click a part to edit its reference, a label to rename it</li>
          </ul>
        </section>
        <section>
          <h3>3D Layout</h3>
          <ul>
            <li>Left click to select · right drag to orbit · middle drag to pan · wheel to zoom · {k('Home')} frame all</li>
            <li>
              Move: {k(keys.translateXPos)}/{k(keys.translateXNeg)} X · {k(keys.translateYPos)}/{k(keys.translateYNeg)} Y · {k(keys.translateZPos)}/{k(keys.translateZNeg)} Z
            </li>
            <li>
              Rotate: {k(keys.rotateXPos)}/{k(keys.rotateXNeg)} X · {k(keys.rotateYPos)}/{k(keys.rotateYNeg)} Y · {k(keys.rotateZPos)}/{k(keys.rotateZNeg)} Z · {k(keys.resetRotation)} reset
            </li>
            <li>
              {k(keys.swapFootprint)} next footprint variant · select an airwire and press {k(keys.insertWire)} to insert a freeform wire · {k('Del')} removes a selected wire
            </li>
            <li>Or drag the gizmo ({k('T')} move, {k('G')} toggle move/rotate)</li>
            <li>SpaceMouse: Chromium browsers via WebHID, use “Connect SpaceMouse” once</li>
          </ul>
        </section>
        <section>
          <h3>General</h3>
          <ul>
            <li>Ctrl+Z / Ctrl+Y undo and redo (the library has its own undo while it is open)</li>
            <li>Old v0.1.x projects: convert the .ffps file with tools/convert_legacy.py, then open the .json</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const set = (patch: Partial<Settings>) => setState((s) => ({ settings: { ...s.settings, ...patch } }));
  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="settings-grid">
        <section>
          <h3>3D layout</h3>
          <NumberSetting label="Rotation step (°)" value={settings.rotationIncrement} onChange={(rotationIncrement) => set({ rotationIncrement })} />
          <NumberSetting label="Translation step (mm)" value={settings.translationIncrement} onChange={(translationIncrement) => set({ translationIncrement })} />
          <NumberSetting label="Airwire thickness (mm)" value={settings.airwireThickness} onChange={(airwireThickness) => set({ airwireThickness })} />
          <h3>SpaceMouse</h3>
          <label className="field check">
            <input type="checkbox" checked={settings.spaceMouse.enabled} onChange={(e) => set({ spaceMouse: { ...settings.spaceMouse, enabled: e.target.checked } })} />
            <span>Enabled</span>
          </label>
          {(['deadzone', 'panSpeed', 'zoomSpeed', 'rotationSpeed'] as const).map((key) => (
            <NumberSetting key={key} label={key} value={settings.spaceMouse[key]} onChange={(v) => set({ spaceMouse: { ...settings.spaceMouse, [key]: v } })} />
          ))}
        </section>
        <section>
          <h3>Keys</h3>
          {(Object.keys(keyLabels) as (keyof Settings['keys'])[]).map((id) => (
            <label key={id} className="field">
              <span>{keyLabels[id]}</span>
              <input
                value={settings.keys[id]}
                maxLength={12}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') return;
                  e.preventDefault();
                  if (e.key.length === 1 || /^(Home|End|Insert|Delete|F\d+)$/.test(e.key)) set({ keys: { ...settings.keys, [id]: e.key.toLowerCase() } });
                }}
                onChange={() => undefined}
                aria-label={keyLabels[id]}
              />
            </label>
          ))}
        </section>
      </div>
      <div className="actions">
        <button onClick={() => set(defaultSettings)}>Restore defaults</button>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function NumberSetting({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} step="any" onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)} />
    </label>
  );
}
