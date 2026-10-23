import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { deriveNetlist, setProjectName } from '../core';
import { SchematicView } from '../schematic/SchematicView';

// Three.js is only needed by these views; loading them on demand keeps the first load small
const LayoutView = lazy(() => import('../layout3d/LayoutView').then((m) => ({ default: m.LayoutView })));
const LibraryView = lazy(() => import('../library-ui/LibraryView').then((m) => ({ default: m.LibraryView })));
import { Modal } from './Dialog';
import { newProject, openExample, openProject, saveProject } from './fileActions';
import { isTypingTarget } from './keyboard';
import { defaultSettings, keyCombo, keyLabel, keyLabels, type Settings } from './settings';
import { apply, dismissNotice, isDirty, redo, setState, setView, undo, useApp, type MenuAction, type View } from './store';

/** from package.json, see vite.config.ts */
declare const __APP_VERSION__: string;

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'schematic', label: 'Schematic', key: 'F1' },
  { id: 'layout', label: '3D Layout', key: 'F2' },
  { id: 'library', label: 'Library', key: 'F3' },
];

export function App() {
  const view = useApp((s) => s.view);
  const [dialog, setDialog] = useState<'help' | 'settings' | 'about' | null>(null);
  const dirty = useApp(isDirty);
  const viewMenus = useApp((s) => s.viewMenus);

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
    <div className="app" data-view={view}>
      <header className="topbar">
        <span className="brand">Freeform-Planner</span>
        <ProjectName />
        <MenuBar>
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
            {viewMenus?.file?.length ? (
              <>
                <hr className="menu-sep" />
                <MenuActions actions={viewMenus.file} />
              </>
            ) : null}
          </Menu>
          <Menu label="Edit">
            <button onClick={undo}>
              Undo <kbd>Ctrl+Z</kbd>
            </button>
            <button onClick={redo}>
              Redo <kbd>Ctrl+Y</kbd>
            </button>
            {viewMenus?.edit?.length ? (
              <>
                <hr className="menu-sep" />
                <MenuActions actions={viewMenus.edit} />
                <hr className="menu-sep" />
              </>
            ) : null}
            <button onClick={() => setDialog('settings')}>Settings…</button>
          </Menu>
          {viewMenus?.tools?.length ? (
            <Menu label="Tools">
              <MenuActions actions={viewMenus.tools} />
            </Menu>
          ) : null}
          {viewMenus?.view?.length ? (
            <Menu label="View">
              <MenuActions actions={viewMenus.view} />
            </Menu>
          ) : null}
          <Menu label="Help">
            <button onClick={() => setDialog('help')} data-testid="menu-help">
              Help <kbd>?</kbd>
            </button>
            <button onClick={() => setDialog('about')} data-testid="menu-about">
              About Freeform-Planner…
            </button>
          </Menu>
        </MenuBar>
        <nav className="view-tabs" role="tablist" aria-label="Views">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'active' : ''} data-view={v.id} onClick={() => setView(v.id)} title={v.key}>
              {v.label}
            </button>
          ))}
        </nav>
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
      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

const MenuBarContext = createContext<{ open: string | null; setOpen: (label: string | null) => void }>({ open: null, setOpen: () => undefined });

/** Desktop-style menu bar: once a menu is open by click, hovering another menu opens that one instead. */
function MenuBar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menubar" ref={ref} role="menubar">
      <MenuBarContext.Provider value={{ open, setOpen }}>{children}</MenuBarContext.Provider>
    </div>
  );
}

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  const { open, setOpen } = useContext(MenuBarContext);
  const isOpen = open === label;
  return (
    <div className="menu">
      <button
        className={isOpen ? 'active' : ''}
        onClick={() => setOpen(isOpen ? null : label)}
        onPointerEnter={() => open && !isOpen && setOpen(label)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {label}
      </button>
      {isOpen && (
        <div className="menu-items" role="menu" onClick={() => setOpen(null)}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuActions({ actions }: { actions: MenuAction[] }) {
  return (
    <>
      {actions.map((a) => (
        <button key={a.label} onClick={a.run} className={a.active ? 'checked' : ''} role="menuitem" data-testid={a.testId}>
          <span>
            {a.active !== undefined && <span className="menu-check">{a.active ? '✓' : ''}</span>}
            {a.label}
          </span>
          {a.shortcut && <kbd>{a.shortcut}</kbd>}
        </button>
      ))}
    </>
  );
}

function ProjectName() {
  const name = useApp((s) => s.history.present.name);
  // keyed by the name so the draft resets when the project changes (open, undo, ...)
  return <ProjectNameInput key={name} name={name} />;
}

function ProjectNameInput({ name }: { name: string }) {
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);
  return (
    <input
      className="project-name"
      value={draft}
      size={Math.max(8, Math.min(32, draft.length + 1))}
      aria-label="Project name"
      title="Project name"
      data-testid="project-name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (cancelled.current || !draft.trim()) {
          cancelled.current = false;
          setDraft(name);
        } else apply((p) => setProjectName(p, draft));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function StatusBar() {
  const project = useApp((s) => s.history.present);
  const fileName = useApp((s) => s.fileName);
  const dirty = useApp(isDirty);
  const cursor = useApp((s) => s.schematicCursor);
  const netlist = deriveNetlist(project);
  const nets = netlist.nets.length;
  return (
    <footer className="statusbar" data-testid="statusbar">
      <span className="status-left">
        <span data-testid="file-name">
          {fileName ?? project.name}
          {dirty ? ' •' : ''}
        </span>
        {cursor && (
          <span data-testid="cursor-pos" title="Cursor position (grid units)">
            {' · '}
            {cursor[0]}, {cursor[1]}
          </span>
        )}
        {cursor && netlist.conflicts.length > 0 && (
          <span className="warning">
            {' · '}⚠ {netlist.conflicts.map((c) => c.names.join(' = ')).join('; ')}: one net has several label names
          </span>
        )}
      </span>
      <span>
        {Object.keys(project.schematic.instances).length} parts · {nets} nets · {Object.keys(project.layout.wires).length} wires
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
  const k = (key: string) => <kbd>{keyLabel(key)}</kbd>;
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
            <li>Left click to select (Shift or Ctrl-click to select several; they move and turn together) · left drag to box-select · {k('Ctrl+A')} select all</li>
            <li>Right drag to orbit · middle drag to pan · wheel to zoom · {k('Home')} zoom to fit</li>
            <li>
              Move: {k(keys.translateXPos)}/{k(keys.translateXNeg)} X · {k(keys.translateYPos)}/{k(keys.translateYNeg)} Y · {k(keys.translateZPos)}/{k(keys.translateZNeg)} Z
            </li>
            <li>
              Rotate: {k(keys.rotateXPos)}/{k(keys.rotateXNeg)} X · {k(keys.rotateYPos)}/{k(keys.rotateYNeg)} Y · {k(keys.rotateZPos)}/{k(keys.rotateZNeg)} Z · {k(keys.resetRotation)} reset
            </li>
            <li>
              {k(keys.swapFootprint)} next footprint variant · select an airwire and press {k(keys.insertWire)} to insert a wire · {k('Del')} removes a selected wire
            </li>
            <li>Or drag the gizmo ({k('M')} move, {k('R')} rotate); position and rotation can also be typed in the panel on the right</li>
            <li>SpaceMouse: Chromium browsers via WebHID, use View → Connect SpaceMouse once</li>
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
          <SpaceMouseStatus />
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
                value={keyLabel(settings.keys[id])}
                maxLength={12}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') return;
                  e.preventDefault();
                  if (e.key.length === 1 || /^(Home|End|Insert|Delete|F\d+)$/.test(e.key)) set({ keys: { ...settings.keys, [id]: keyCombo(e) } });
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

function SpaceMouseStatus() {
  const spaceMouse = useApp((s) => s.spaceMouse);
  let status: React.ReactNode;
  if (!('hid' in navigator)) status = 'Not supported by this browser (needs WebHID: Chrome, Edge or another Chromium browser).';
  else if (spaceMouse?.connected) status = 'Connected ✓';
  else if (spaceMouse)
    status = (
      <>
        Not connected. <button onClick={spaceMouse.connect}>Connect SpaceMouse…</button>
      </>
    );
  else status = 'Not connected. Open the 3D Layout to connect it.';
  return (
    <p className="muted" data-testid="spacemouse-status">
      {status}
    </p>
  );
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About Freeform-Planner" onClose={onClose}>
      <div className="about" data-testid="about">
        <p>
          <b>Freeform-Planner</b> {__APP_VERSION__}
        </p>
        <p>A browser app for planning freeform / point-to-point electronic circuits. Draw a schematic, place the components in 3D space and follow the airwires until everything is connected.</p>
        <p>
          Source code and releases:{' '}
          <a href="https://github.com/lbarbisch/Freeform-Planner" target="_blank" rel="noreferrer">
            github.com/lbarbisch/Freeform-Planner
          </a>
        </p>
        <p className="muted">Licensed under the GNU General Public License v3.0 or later.</p>
      </div>
      <div className="actions">
        <button className="primary" onClick={onClose}>
          Close
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
