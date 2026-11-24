import { PixelFrame, PixelProject } from './types';
import { renderFrameToCanvas } from './storage';

function getProjectFrames(project: PixelProject): PixelFrame[] {
  if (project.frames && project.frames.length > 0) return project.frames;
  return [
    {
      id: 'frame_1',
      layers: project.layers,
      groups: project.groups,
      activeLayerIndex: project.activeLayerIndex,
    },
  ];
}

export function downloadProjectSpritesheet(
  project: PixelProject,
  scale: number,
  layout: 'horizontal' | 'grid',
  gridCols: number
): void {
  const frames = getProjectFrames(project);
  const cols =
    layout === 'horizontal'
      ? frames.length
      : Math.max(1, Math.min(frames.length, gridCols));
  const rows = Math.ceil(frames.length / cols);
  const fw = project.width * scale;
  const fh = project.height * scale;

  const sheet = document.createElement('canvas');
  sheet.width = cols * fw;
  sheet.height = rows * fh;
  const ctx = sheet.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  const tmp = document.createElement('canvas');
  frames.forEach((frame, i) => {
    renderFrameToCanvas(project.width, project.height, frame, tmp);
    const cx = (i % cols) * fw;
    const cy = Math.floor(i / cols) * fh;
    ctx.drawImage(tmp, cx, cy, fw, fh);
  });

  const url = sheet.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9_-]/gi, '_')}_sheet_${scale}x.png`;
  a.click();
}

function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxTable = 4096;

  let dict = new Map<string, number>();
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  const outBytes: number[] = [];
  let bitBuf = 0;
  let bitCount = 0;
  const emit = (code: number) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      outBytes.push(bitBuf & 0xff);
      bitBuf >>>= 8;
      bitCount -= 8;
    }
  };

  resetDict();
  emit(clearCode);

  if (indices.length > 0) {
    let prefix = String(indices[0]);
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const nextKey = `${prefix},${k}`;
      if (dict.has(nextKey)) {
        prefix = nextKey;
      } else {
        emit(dict.get(prefix)!);
        if (nextCode < maxTable) {
          dict.set(nextKey, nextCode++);
          if (nextCode > 1 << codeSize && codeSize < 12) {
            codeSize++;
          }
        } else {
          emit(clearCode);
          resetDict();
        }
        prefix = String(k);
      }
    }
    emit(dict.get(prefix)!);
  }

  emit(eoiCode);
  if (bitCount > 0) outBytes.push(bitBuf & 0xff);
  return outBytes;
}

export function downloadProjectGif(
  project: PixelProject,
  scale: number,
  fps: number
): void {
  const frames = getProjectFrames(project);
  const w = project.width * scale;
  const h = project.height * scale;
  const delayCs = Math.max(2, Math.round(100 / Math.max(1, fps)));

  const baseCanvas = document.createElement('canvas');
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = w;
  scaledCanvas.height = h;
  const sctx = scaledCanvas.getContext('2d');
  if (!sctx) return;

  // Build global 256-color palette (index 0 = transparent)
  const colorCounts = new Map<number, number>();
  const frameRgbaList: Uint8ClampedArray[] = [];

  for (const frame of frames) {
    renderFrameToCanvas(project.width, project.height, frame, baseCanvas);
    sctx.clearRect(0, 0, w, h);
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(baseCanvas, 0, 0, w, h);
    const data = sctx.getImageData(0, 0, w, h).data;
    frameRgbaList.push(data);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      // Quantize to 6-bit per channel for fast palette packing
      const key =
        ((data[i] & 0xfc) << 16) | ((data[i + 1] & 0xfc) << 8) | (data[i + 2] & 0xfc);
      colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
    }
  }

  const sortedColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 255)
    .map(([rgb]) => rgb);

  const palBytes = new Uint8Array(256 * 3);
  const palMap = new Map<number, number>();
  sortedColors.forEach((rgb, i) => {
    const idx = i + 1;
    palMap.set(rgb, idx);
    palBytes[idx * 3] = (rgb >>> 16) & 0xff;
    palBytes[idx * 3 + 1] = (rgb >>> 8) & 0xff;
    palBytes[idx * 3 + 2] = rgb & 0xff;
  });

  const nearestColor = (r: number, g: number, b: number): number => {
    const qKey = ((r & 0xfc) << 16) | ((g & 0xfc) << 8) | (b & 0xfc);
    const exact = palMap.get(qKey);
    if (exact !== undefined) return exact;
    let best = 1;
    let bestDist = Infinity;
    for (let i = 0; i < sortedColors.length; i++) {
      const rgb = sortedColors[i];
      const dr = r - ((rgb >>> 16) & 0xff);
      const dg = g - ((rgb >>> 8) & 0xff);
      const db = b - (rgb & 0xff);
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        best = i + 1;
      }
    }
    return best;
  };

  const out: number[] = [];
  const pushStr = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  const pushU16 = (v: number) => {
    out.push(v & 0xff, (v >>> 8) & 0xff);
  };

  // GIF89a Header + Logical Screen Descriptor
  pushStr('GIF89a');
  pushU16(w);
  pushU16(h);
  out.push(0xf7, 0, 0); // Global Color Table flag=1, 8-bit color, 256 entries
  for (let i = 0; i < palBytes.length; i++) out.push(palBytes[i]);

  // Netscape 2.0 Loop Extension (infinite loop)
  out.push(0x21, 0xff, 0x0b);
  pushStr('NETSCAPE2.0');
  out.push(0x03, 0x01, 0x00, 0x00, 0x00);

  for (const data of frameRgbaList) {
    // Graphics Control Extension (disposal=2, transparent index=0)
    out.push(0x21, 0xf9, 0x04, 0x09);
    pushU16(delayCs);
    out.push(0x00, 0x00);

    // Image Descriptor
    out.push(0x2c);
    pushU16(0);
    pushU16(0);
    pushU16(w);
    pushU16(h);
    out.push(0x00);

    const indices = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const off = i * 4;
      if (data[off + 3] < 128) {
        indices[i] = 0;
      } else {
        indices[i] = nearestColor(data[off], data[off + 1], data[off + 2]);
      }
    }

    const minCodeSize = 8;
    out.push(minCodeSize);
    const lzw = lzwEncode(indices, minCodeSize);
    for (let i = 0; i < lzw.length; i += 255) {
      const chunk = lzw.slice(i, i + 255);
      out.push(chunk.length);
      for (const b of chunk) out.push(b);
    }
    out.push(0x00);
  }

  out.push(0x3b);

  const blob = new Blob([new Uint8Array(out)], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9_-]/gi, '_')}_${scale}x.gif`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
