/** Application state. A tiny external store (no framework) so it can be used from React views,
 * imperative Three.js code and Playwright tests alike. */
import { useSyncExternalStore } from 'react';
import {
  commit,
  createHistory,
  emptyProject,
  emptySelection,
  redo as historyRedo,
  seal,
  undo as historyUndo,
  type History,
  type Library,
  type Project,
  type Selection,
  type Vec2,
} from '../core';
import { builtinLibrary } from '../library/builtin';
import { defaultSettings, type Settings } from './settings';

export type View = 'schematic' | 'layout' | 'library';

export interface AppSelection extends Selection {
  /** wires in the 3D layout */
  layoutWires: string[];
}

export interface Notice {
  id: number;
  kind: 'info' | 'warning' | 'error';
  text: string;
}

export interface AppState {
  history: History<Project>;
  /** working library used for placing parts; persisted in the browser */
  library: Library;
  libraryHistory: History<Library>;
  view: View;
  selection: AppSelection;
  fileName: string | null;
  /** history.present at the last save; dirty when they differ */
  savedProject: Project;
  notices: Notice[];
  settings: Settings;
  /** grid position of the mouse in the schematic, null while the schematic is not shown */
  schematicCursor: Vec2 | null;
  viewMenus: ViewMenus | null;
  /** SpaceMouse connection of the 3D layout; null while the layout is not shown or WebHID is missing */
  spaceMouse: { connected: boolean; connect: () => void } | null;
}

export interface MenuAction {
  label: string;
  run: () => void;
  shortcut?: string;
  /** shown as checked, e.g. the current tool */
  active?: boolean;
  testId?: string;
}

/** Menu entries contributed by the current view; the app bar adds them to File / Edit and shows Tools / View. */
export interface ViewMenus {
  /** added to the File menu */
  file?: MenuAction[];
  /** added to the Edit menu */
  edit?: MenuAction[];
  tools?: MenuAction[];
  view?: MenuAction[];
}

export const emptyAppSelection = (): AppSelection => ({ ...emptySelection(), layoutWires: [] });

function initialState(): AppState {
  const project = emptyProject();
  return {
    history: createHistory(project),
    library: builtinLibrary,
    libraryHistory: createHistory(builtinLibrary),
    view: 'schematic',
    selection: emptyAppSelection(),
    fileName: null,
    savedProject: project,
    notices: [],
    settings: defaultSettings,
    schematicCursor: null,
    viewMenus: null,
    spaceMouse: null,
  };
}

let state = initialState();
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export const project = () => state.history.present;

// ------------------------------------------------------------------ actions

/** Applies a pure project edit as one undo step (or merges it into the running step for the
 * same coalesce key, e.g. while dragging). Selection entries that no longer exist are dropped. */
export function apply(edit: (p: Project) => Project, coalesceKey: string | null = null): void {
  const next = edit(state.history.present);
  if (next === state.history.present) return;
  setState({ history: commit(state.history, next, coalesceKey), selection: pruneSelection(state.selection, next) });
}

/** Ends a coalescing run (call on pointer up). */
export function endGesture(): void {
  if (state.history.lastKey !== null) setState({ history: seal(state.history) });
}

export function undo(): void {
  const history = historyUndo(state.history);
  setState({ history, selection: pruneSelection(state.selection, history.present) });
}

export function redo(): void {
  const history = historyRedo(state.history);
  setState({ history, selection: pruneSelection(state.selection, history.present) });
}

function pruneSelection(sel: AppSelection, p: Project): AppSelection {
  const keep = (ids: string[], rec: Record<string, unknown>) => ids.filter((id) => id in rec);
  const next = {
    instances: keep(sel.instances, p.schematic.instances),
    wires: keep(sel.wires, p.schematic.wires),
    labels: keep(sel.labels, p.schematic.labels),
    layoutWires: keep(sel.layoutWires, p.layout.wires),
  };
  const same = (Object.keys(next) as (keyof AppSelection)[]).every((k) => next[k].length === sel[k].length);
  return same ? sel : next;
}

export function select(sel: Partial<AppSelection>): void {
  setState({ selection: { ...emptyAppSelection(), ...sel } });
}

export function clearSelection(): void {
  const s = state.selection;
  if (s.instances.length || s.wires.length || s.labels.length || s.layoutWires.length) setState({ selection: emptyAppSelection() });
}

/** Replaces the document (new / open). Clears undo history. */
export function loadDocument(p: Project, fileName: string | null): void {
  setState({ history: createHistory(p), savedProject: p, fileName, selection: emptyAppSelection() });
}

export function markSaved(fileName: string | null): void {
  setState({ savedProject: state.history.present, fileName });
}

export const isDirty = (s: AppState) => s.history.present !== s.savedProject;

let noticeId = 0;
export function notify(kind: Notice['kind'], text: string, timeoutMs = kind === 'error' ? 10000 : 5000): void {
  const id = ++noticeId;
  setState({ notices: [...state.notices, { id, kind, text }] });
  if (timeoutMs > 0) setTimeout(() => dismissNotice(id), timeoutMs);
}

export function dismissNotice(id: number): void {
  setState({ notices: state.notices.filter((n) => n.id !== id) });
}

export function setView(view: View): void {
  setState({ view });
}

// ------------------------------------------------------------------ library

export function applyLibrary(edit: (l: Library) => Library, coalesceKey: string | null = null): void {
  const next = edit(state.library);
  if (next === state.library) return;
  const libraryHistory = commit(state.libraryHistory, next, coalesceKey);
  setState({ library: next, libraryHistory });
}

export function undoLibrary(): void {
  const libraryHistory = historyUndo(state.libraryHistory);
  setState({ libraryHistory, library: libraryHistory.present });
}

export function redoLibrary(): void {
  const libraryHistory = historyRedo(state.libraryHistory);
  setState({ libraryHistory, library: libraryHistory.present });
}

export function replaceLibrary(library: Library): void {
  setState({ library, libraryHistory: createHistory(library) });
}

export function resetForTests(): void {
  state = initialState();
  for (const l of listeners) l();
}
