/** Browser persistence: a small IndexedDB key-value store for autosave, the user library and
 * settings, plus file open/save helpers. Every storage access may fail (private windows,
 * blocked storage); failures degrade to "not persisted" and never break the app. */

const DB_NAME = 'freeform-planner';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function kvSet(key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function kvDelete(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ------------------------------------------------------------------ files

/** Opens a file picker and returns the chosen file's name and text. */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.dataset.testid = 'file-input';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      resolve(file ? { name: file.name, text: await file.text() } : null);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ name: string; createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>;
}

/** Saves text. Uses the native save dialog where available, otherwise a download.
 * Returns the file name used, or null when the user cancelled. */
export async function saveTextFile(suggestedName: string, text: string, mime: string, extension: string): Promise<string | null> {
  const w = window as unknown as SaveFilePickerWindow;
  const blob = new Blob([text], { type: mime });
  if (w.showSaveFilePicker && !navigator.webdriver) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Freeform-Planner file', accept: { [mime]: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      // fall through to download
    }
  }
  downloadBlob(suggestedName, blob);
  return suggestedName;
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
