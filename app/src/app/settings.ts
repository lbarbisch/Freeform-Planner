/** User settings, mirroring settings.py of v0.1.x. Key names follow KeyboardEvent.key (lower case),
 * letters may carry a `shift+` prefix. */

export interface Settings {
  rotationIncrement: number;
  translationIncrement: number;
  airwireThickness: number;
  keys: {
    resetRotation: string;
    rotateXPos: string;
    rotateXNeg: string;
    rotateYPos: string;
    rotateYNeg: string;
    rotateZPos: string;
    rotateZNeg: string;
    translateXPos: string;
    translateXNeg: string;
    translateYPos: string;
    translateYNeg: string;
    translateZPos: string;
    translateZNeg: string;
    swapFootprint: string;
    /** was Ctrl+W, which browsers reserve for closing the tab */
    insertWire: string;
  };
  spaceMouse: {
    enabled: boolean;
    deadzone: number;
    panSpeed: number;
    zoomSpeed: number;
    rotationSpeed: number;
  };
}

export const defaultSettings: Settings = {
  rotationIncrement: 15,
  translationIncrement: 1,
  airwireThickness: 0.2,
  keys: {
    // M / R pick the gizmo mode
    resetRotation: 'shift+r',
    rotateXPos: 'w',
    rotateXNeg: 's',
    rotateYPos: 'd',
    rotateYNeg: 'a',
    rotateZPos: 'e',
    rotateZNeg: 'q',
    translateXPos: '6',
    translateXNeg: '4',
    translateYPos: '9',
    translateYNeg: '1',
    translateZPos: '8',
    translateZNeg: '2',
    swapFootprint: 'f',
    insertWire: 'i',
  },
  spaceMouse: { enabled: true, deadzone: 0.05, panSpeed: 1, zoomSpeed: 1.5, rotationSpeed: 120 },
};

export const keyLabels: Record<keyof Settings['keys'], string> = {
  resetRotation: 'Reset rotation',
  rotateXPos: 'Rotate +X',
  rotateXNeg: 'Rotate −X',
  rotateYPos: 'Rotate +Y',
  rotateYNeg: 'Rotate −Y',
  rotateZPos: 'Rotate +Z',
  rotateZNeg: 'Rotate −Z',
  translateXPos: 'Move +X',
  translateXNeg: 'Move −X',
  translateYPos: 'Move +Y',
  translateYNeg: 'Move −Y',
  translateZPos: 'Move +Z',
  translateZNeg: 'Move −Z',
  swapFootprint: 'Next footprint variant',
  insertWire: 'Insert wire (airwire selected)',
};

/** Merges stored settings over the defaults so new settings get default values. */
export function mergeSettings(stored: unknown): Settings {
  if (typeof stored !== 'object' || stored === null) return defaultSettings;
  const s = stored as Partial<Settings>;
  return {
    ...defaultSettings,
    ...s,
    keys: migrateKeys({ ...defaultSettings.keys, ...(s.keys ?? {}) }),
    spaceMouse: { ...defaultSettings.spaceMouse, ...(s.spaceMouse ?? {}) },
  };
}

function migrateKeys(keys: Settings['keys']): Settings['keys'] {
  // R used to reset the rotation; it now selects the rotate gizmo
  return keys.resetRotation === 'r' ? { ...keys, resetRotation: defaultSettings.keys.resetRotation } : keys;
}

/** The key setting a key press matches, e.g. `r` or `shift+r`. Shift is only part of the
 * combination for letters; for other keys it already changes `key` itself. */
export function keyCombo(e: { key: string; shiftKey: boolean }): string {
  const key = e.key.toLowerCase();
  return e.shiftKey && /^[a-z]$/.test(key) ? `shift+${key}` : key;
}

/** Display form of a key setting: `shift+r` -> `Shift+R`. */
export function keyLabel(combo: string): string {
  return combo.startsWith('shift+') ? `Shift+${combo.slice(6).toUpperCase()}` : combo.toUpperCase();
}
