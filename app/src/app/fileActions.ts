import { emptyProject, FileFormatError, loadProjectText, saveProjectText } from '../core';
import { getState, isDirty, loadDocument, markSaved, notify, setView } from './store';
import { pickTextFile, saveTextFile } from './persistence';

function announceLoaded(): void {
  window.dispatchEvent(new Event('ffp:document-loaded'));
}

function confirmDiscard(): boolean {
  return !isDirty(getState()) || window.confirm('The current project has unsaved changes. Discard them?');
}

export function newProject(): void {
  if (!confirmDiscard()) return;
  loadDocument(emptyProject(), null);
  setView('schematic');
  announceLoaded();
}

export function openProjectText(name: string, text: string): boolean {
  try {
    const { project, warnings } = loadProjectText(text, getState().library);
    const fileName = /\.ffp\.json$/i.test(name) ? name : null;
    loadDocument(fileName ? project : { ...project, name: name.replace(/\.json$/i, '') }, fileName);
    for (const w of warnings) notify('warning', w);
    if (!fileName) notify('info', `Imported ${name}. Use Save to store it in the current format.`);
    announceLoaded();
    return true;
  } catch (e) {
    const msg = e instanceof FileFormatError ? e.message : String(e);
    notify('error', `Could not open ${name}: ${msg}`);
    return false;
  }
}

export async function openProject(): Promise<void> {
  if (!confirmDiscard()) return;
  const file = await pickTextFile('.json,application/json');
  if (file) openProjectText(file.name, file.text);
}

export async function openExample(): Promise<void> {
  if (!confirmDiscard()) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}examples/transistor-blinker.ffp.json`);
    if (!res.ok) throw new Error(res.statusText);
    if (openProjectText('transistor-blinker.ffp.json', await res.text())) {
      // examples are templates: saving must not overwrite anything
      markSaved(null);
      setView('layout');
    }
  } catch (e) {
    notify('error', `Could not load the example: ${String(e)}`);
  }
}

export async function saveProject(saveAs = false): Promise<void> {
  const s = getState();
  const project = s.history.present;
  const suggested = s.fileName && !saveAs ? s.fileName : `${(project.name || 'project').replace(/[^\w-]+/g, '_')}.ffp.json`;
  const name = await saveTextFile(suggested, saveProjectText(project), 'application/json', '.json');
  if (name) {
    markSaved(name.endsWith('.ffp.json') ? name : suggested);
    notify('info', `Saved ${name}`);
  }
}
