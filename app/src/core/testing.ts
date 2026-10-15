/** Small hand-written library for unit tests (independent of the built-in library). */
import type { FootprintDef, LibrarySet, PartDef, SymbolDef } from './model';

const twoPinSymbol = (id: string, prefix: string): SymbolDef => ({
  id,
  name: id,
  refPrefix: prefix,
  graphics: [{ kind: 'rect', from: [-2, -1], to: [2, 1], fill: false }],
  pins: [
    { number: '1', name: '', at: [-3, 0], dir: 'right', length: 1 },
    { number: '2', name: '', at: [3, 0], dir: 'left', length: 1 },
  ],
  refAt: [0, -2],
  valueAt: [0, 2],
  showPinNumbers: false,
  showPinNames: false,
  power: false,
});

const gnd: SymbolDef = {
  id: 'GND',
  name: 'GND',
  refPrefix: '#PWR',
  graphics: [{ kind: 'line', points: [[0, 0], [0, 1]], fill: false }],
  pins: [{ number: '1', name: 'GND', at: [0, 0], dir: 'down', length: 0 }],
  refAt: [0, 0],
  valueAt: [0, 2],
  showPinNumbers: false,
  showPinNames: false,
  power: true,
};

const fp = (id: string, half: number, extra: Partial<FootprintDef> = {}): FootprintDef => ({
  id,
  name: id,
  model: { kind: 'none' },
  modelRotation: [0, 0, 0, 1],
  modelOffset: [0, 0, 0],
  modelScale: 1,
  pins: [
    { number: '1', position: [half, 0, 0] },
    { number: '2', position: [-half, 0, 0] },
  ],
  isWire: false,
  ...extra,
});

const part = (id: string, symbolId: string, variants: PartDef['variants'], value = id): PartDef => ({
  id,
  name: id,
  description: '',
  symbolId,
  defaultValue: value,
  variants,
});

export function testLibrary(): LibrarySet {
  return {
    symbols: { R: twoPinSymbol('R', 'R'), D: twoPinSymbol('D', 'D'), GND: gnd },
    footprints: {
      R_LONG: fp('R_LONG', 10),
      R_SHORT: fp('R_SHORT', 2),
      WIRE_A: fp('WIRE_A', 5, { isWire: true }),
      WIRE_B: fp('WIRE_B', 8, { isWire: true }),
    },
    parts: {
      RES: part(
        'RES',
        'R',
        [
          { footprintId: 'R_LONG', pinMap: { '1': '1', '2': '2' } },
          { footprintId: 'R_SHORT', pinMap: { '1': '1', '2': '2' } },
        ],
        '10k',
      ),
      // swapped pin map: symbol pin 1 is footprint pin 2
      DIODE: part('DIODE', 'D', [{ footprintId: 'R_SHORT', pinMap: { '1': '2', '2': '1' } }]),
      GND: part('GND', 'GND', []),
    },
  };
}
