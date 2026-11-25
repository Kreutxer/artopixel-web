import { PixelTool } from '../engine/types';

export type ShortcutAction =
  | PixelTool
  | 'brushScrub'
  | 'brushDec'
  | 'brushInc'
  | 'pixelPerfect';

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  pencil: 'b',
  eraser: 'e',
  shade: 's',
  fill: 'g',
  eyedropper: 'i',
  line: 'l',
  rectangle: 'r',
  circle: 'c',
  curve: 'u',
  marquee: 'm',
  move: 'v',
  brushScrub: 'f',
  brushDec: '[',
  brushInc: ']',
  pixelPerfect: 'p',
};

export const SHORTCUT_LABELS: Array<[ShortcutAction, string]> = [
  ['pencil', 'Pencil'],
  ['eraser', 'Eraser'],
  ['shade', 'Shade (Lighten / Darken)'],
  ['fill', 'Fill Bucket'],
  ['eyedropper', 'Eyedropper'],
  ['line', 'Line'],
  ['rectangle', 'Rectangle'],
  ['circle', 'Circle'],
  ['curve', 'Curve'],
  ['marquee', 'Marquee Select'],
  ['move', 'Move Layer(s)'],
  ['pixelPerfect', 'Toggle Pixel Perfect'],
  ['brushScrub', 'Scrub Brush Size (+ Move)'],
  ['brushDec', 'Decrease Brush Size'],
  ['brushInc', 'Increase Brush Size'],
];

export function loadShortcuts(): Record<ShortcutAction, string> {
  try {
    const raw = localStorage.getItem('artopixel_shortcuts_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_SHORTCUTS, ...parsed };
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SHORTCUTS };
}
