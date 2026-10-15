import { loadLibrary, type Library } from '../core';
import data from './builtin.library.json';

/** The library shipped with the app. Validated at startup like any user library. */
export const builtinLibrary: Library = loadLibrary(data);
