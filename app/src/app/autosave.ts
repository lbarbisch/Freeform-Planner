/** Keeps unsaved work, the working library and settings in IndexedDB. */
import { loadLibrary, loadProject, saveProjectText, type Library } from '../core';
import { kvDelete, kvGet, kvSet } from './persistence';
import { mergeSettings } from './settings';
import { getState, isDirty, notify, replaceLibrary, setState, subscribe, loadDocument } from './store';
import { builtinLibrary } from '../library/builtin';

const KEY_PROJECT = 'autosave.project';
const KEY_LIBRARY = 'library';
const KEY_SETTINGS = 'settings';

interface AutosaveRecord {
  text: string;
  fileName: string | null;
  savedAt: number;
}

/** Restores persisted state, then keeps persisting changes. Returns an unsubscribe function. */
export async function startPersistence(): Promise<() => void> {
  const [storedLib, storedSettings, autosave] = await Promise.all([kvGet<unknown>(KEY_LIBRARY), kvGet<unknown>(KEY_SETTINGS), kvGet<AutosaveRecord>(KEY_PROJECT)]);

  if (storedLib) {
    try {
      replaceLibrary(withNewBuiltins(loadLibrary(storedLib)));
    } catch (e) {
      notify('warning', `Your saved library could not be loaded and the built-in library is used instead (${(e as Error).message}).`);
    }
  }
  if (storedSettings) setState({ settings: mergeSettings(storedSettings) });
  if (autosave) {
    try {
      const { project } = loadProject(JSON.parse(autosave.text), getState().library);
      loadDocument(project, autosave.fileName);
      // restored work is unsaved by definition
      setState({ savedProject: { ...project } });
      notify('info', `Restored unsaved work from ${new Date(autosave.savedAt).toLocaleString()}.`);
      window.dispatchEvent(new Event('ffp:document-loaded'));
    } catch {
      await kvDelete(KEY_PROJECT);
    }
  }

  let timer = 0;
  let last = getState();
  return subscribe(() => {
    const s = getState();
    if (s.library !== last.library) void kvSet(KEY_LIBRARY, s.library);
    if (s.settings !== last.settings) void kvSet(KEY_SETTINGS, s.settings);
    if (s.history.present !== last.history.present || s.savedProject !== last.savedProject) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const now = getState();
        if (isDirty(now)) void kvSet(KEY_PROJECT, { text: saveProjectText(now.history.present), fileName: now.fileName, savedAt: Date.now() } satisfies AutosaveRecord);
        else void kvDelete(KEY_PROJECT);
      }, 500);
    }
    last = s;
  });
}

/** Built-in items added in newer app versions appear in existing user libraries. */
function withNewBuiltins(lib: Library): Library {
  const add = <K extends 'symbols' | 'footprints' | 'parts'>(kind: K) => ({ ...builtinLibrary[kind], ...lib[kind] });
  return { ...lib, symbols: add('symbols'), footprints: add('footprints'), parts: add('parts') };
}
