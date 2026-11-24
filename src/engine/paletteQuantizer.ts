import { SavedPalette } from './types';

export const PRESET_PALETTES: SavedPalette[] = [
  {
    id: 'preset_retro16',
    name: 'Retro 16',
    isPreset: true,
    colors: [
      0xff000000, 0xff1d2b53, 0xff7e2553, 0xff008751,
      0xffab5236, 0xff5f574f, 0xffc2c3c7, 0xfffff1e8,
      0xffff004d, 0xffffa300, 0xffffec27, 0xff00e436,
      0xff29adff, 0xff83769c, 0xffff77a8, 0xffffccaa,
    ],
  },
  {
    id: 'preset_pocket4',
    name: 'Pocket 4',
    isPreset: true,
    colors: [0xff0f380f, 0xff306230, 0xff8bac0f, 0xff9bbc0f],
  },
  {
    id: 'preset_endesga16',
    name: 'Endesga 16',
    isPreset: true,
    colors: [
      0xff181425, 0xff262b44, 0xff3a4466, 0xff5a6988,
      0xff8b9bb4, 0xffc0cbdc, 0xffffffff, 0xffff0044,
      0xffe43b44, 0xfff77622, 0xfffee761, 0xff63c74d,
      0xff3e8948, 0xff0095e9, 0xff124e89, 0xffb55088,
    ],
  },
  {
    id: 'preset_gray8',
    name: 'Grayscale 8',
    isPreset: true,
    colors: [
      0xff000000, 0xff242424, 0xff494949, 0xff6d6d6d,
      0xff929292, 0xffb6b6b6, 0xffdbdbdb, 0xffffffff,
    ],
  },
];

export function argbToCss(argb: number): string {
  const a = ((argb >>> 24) & 0xff) / 255;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

export function argbToHex6(argb: number): string {
  return (argb & 0x00ffffff).toString(16).padStart(6, '0').toUpperCase();
}

function luminance(argb: number): number {
  const r = ((argb >>> 16) & 0xff) / 255;
  const g = ((argb >>> 8) & 0xff) / 255;
  const b = (argb & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function extractPaletteFromDataUrl(
  dataUrl: string,
  targetCount = 16
): Promise<number[]> {
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('Image load failed'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;

  const samples: Array<[number, number, number]> = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (samples.length === 0) return [];

  const buckets: Array<Array<[number, number, number]>> = [samples];
  while (buckets.length < targetCount) {
    let bestIdx = -1;
    let bestRange = -1;
    let bestCh = 0;

    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.length < 2) continue;
      for (let ch = 0; ch < 3; ch++) {
        let minV = 255;
        let maxV = 0;
        for (const px of b) {
          if (px[ch] < minV) minV = px[ch];
          if (px[ch] > maxV) maxV = px[ch];
        }
        const range = maxV - minV;
        if (range > bestRange) {
          bestRange = range;
          bestIdx = i;
          bestCh = ch;
        }
      }
    }

    if (bestIdx === -1 || bestRange <= 0) break;
    const toSplit = buckets.splice(bestIdx, 1)[0];
    toSplit.sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = Math.floor(toSplit.length / 2);
    buckets.push(toSplit.slice(0, mid), toSplit.slice(mid));
  }

  const colors = buckets.map((b) => {
    let r = 0, g = 0, bl = 0;
    for (const px of b) {
      r += px[0];
      g += px[1];
      bl += px[2];
    }
    const n = Math.max(1, b.length);
    return (
      ((0xff << 24) |
        ((Math.floor(r / n) & 0xff) << 16) |
        ((Math.floor(g / n) & 0xff) << 8) |
        (Math.floor(bl / n) & 0xff)) >>>
      0
    );
  });

  colors.sort((a, b) => luminance(a) - luminance(b));
  return colors;
}
