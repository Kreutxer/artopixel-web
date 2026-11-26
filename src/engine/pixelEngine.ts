import { BrushShape, CanvasDoc, GridRect, MirrorMode, PixelFrame, PixelProject } from './types';

export interface DrawAction {
  frameId?: string;
  layerId: string;
  oldPixels: Map<number, number>;
  newPixels: Map<number, number>;
  extraLayers?: Array<{
    layerId: string;
    oldPixels: Map<number, number>;
    newPixels: Map<number, number>;
  }>;
}

export function ensureProjectFrames(project: PixelProject): PixelProject {
  if (project.frames && project.frames.length > 0) {
    const idx = Math.max(
      0,
      Math.min(project.frames.length - 1, project.activeFrameIndex ?? 0)
    );
    const active = project.frames[idx];
    return {
      ...project,
      activeFrameIndex: idx,
      fps: project.fps ?? 8,
      layers: active.layers,
      groups: active.groups,
      activeLayerIndex: active.activeLayerIndex,
    };
  }
  const firstFrame: PixelFrame = {
    id: `frame_${Date.now()}`,
    layers: project.layers,
    groups: project.groups,
    activeLayerIndex: project.activeLayerIndex,
  };
  return {
    ...project,
    frames: [firstFrame],
    activeFrameIndex: 0,
    fps: project.fps ?? 8,
  };
}

export function createCanvasDoc(
  name = 'Canvas 1',
  width = 32,
  height = 32
): CanvasDoc {
  const layer = {
    id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: 'Layer 1',
    visible: true,
    opacity: 1.0,
    groupId: null,
    pixels: new Uint32Array(width * height),
  };
  return {
    id: `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    width,
    height,
    layers: [layer],
    groups: [],
    activeLayerIndex: 0,
    frames: [
      {
        id: `frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        layers: [layer],
        groups: [],
        activeLayerIndex: 0,
      },
    ],
    activeFrameIndex: 0,
    fps: 8,
  };
}

export function ensureProjectCanvases(project: PixelProject): PixelProject {
  if (project.canvases && project.canvases.length > 0) {
    const cIdx = Math.max(
      0,
      Math.min(project.canvases.length - 1, project.activeCanvasIndex ?? 0)
    );
    const activeCanvas = project.canvases[cIdx];
    const normalizedActive = ensureProjectFrames({
      ...project,
      width: activeCanvas.width,
      height: activeCanvas.height,
      layers: activeCanvas.layers,
      groups: activeCanvas.groups,
      activeLayerIndex: activeCanvas.activeLayerIndex,
      frames: activeCanvas.frames,
      activeFrameIndex: activeCanvas.activeFrameIndex,
      fps: activeCanvas.fps,
    });
    const nextCanvases = [...project.canvases];
    nextCanvases[cIdx] = {
      ...activeCanvas,
      layers: normalizedActive.layers,
      groups: normalizedActive.groups,
      activeLayerIndex: normalizedActive.activeLayerIndex,
      frames: normalizedActive.frames,
      activeFrameIndex: normalizedActive.activeFrameIndex,
      fps: normalizedActive.fps,
    };
    return {
      ...normalizedActive,
      canvases: nextCanvases,
      activeCanvasIndex: cIdx,
    };
  }
  const withFrames = ensureProjectFrames(project);
  const firstCanvas: CanvasDoc = {
    id: `canvas_${project.id}`,
    name: project.name || 'Canvas 1',
    width: withFrames.width,
    height: withFrames.height,
    layers: withFrames.layers,
    groups: withFrames.groups,
    activeLayerIndex: withFrames.activeLayerIndex,
    frames: withFrames.frames,
    activeFrameIndex: withFrames.activeFrameIndex,
    fps: withFrames.fps,
  };
  return {
    ...withFrames,
    canvases: [firstCanvas],
    activeCanvasIndex: 0,
  };
}

export function createNewProject(
  name = 'Untitled Sprite',
  width = 32,
  height = 32
): PixelProject {
  const firstCanvas = createCanvasDoc(name, width, height);
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    width,
    height,
    layers: firstCanvas.layers,
    groups: firstCanvas.groups,
    activeLayerIndex: 0,
    frames: firstCanvas.frames,
    activeFrameIndex: 0,
    fps: 8,
    canvases: [firstCanvas],
    activeCanvasIndex: 0,
    referenceDataUrl: null,
    referenceVisible: true,
    updatedAt: Date.now(),
  };
}

const brushOffsetsCache = new Map<string, Array<[number, number]>>();

export function brushOffsets(
  size: number,
  shape: BrushShape
): Array<[number, number]> {
  if (size <= 1) return [[0, 0]];
  const key = `${size}_${shape}`;
  const cached = brushOffsetsCache.get(key);
  if (cached) return cached;

  const startOff = -Math.floor((size - 1) / 2);
  const offsets: Array<[number, number]> = [];

  if (shape === 'square') {
    for (let iy = 0; iy < size; iy++) {
      for (let ix = 0; ix < size; ix++) {
        offsets.push([startOff + ix, startOff + iy]);
      }
    }
    brushOffsetsCache.set(key, offsets);
    return offsets;
  }

  const center = (size - 1) / 2;
  const radius = size / 2;
  const maxDistSq = radius * radius - 0.3;
  for (let iy = 0; iy < size; iy++) {
    for (let ix = 0; ix < size; ix++) {
      const dx = ix - center;
      const dy = iy - center;
      if (dx * dx + dy * dy <= maxDistSq) {
        offsets.push([startOff + ix, startOff + iy]);
      }
    }
  }
  brushOffsetsCache.set(key, offsets);
  return offsets;
}

export function bresenham(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plot: (x: number, y: number) => void
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let cx = x0;
  let cy = y0;

  while (true) {
    plot(cx, cy);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}

export function forEachMirrored(
  x: number,
  y: number,
  w: number,
  h: number,
  mode: MirrorMode,
  fn: (mx: number, my: number) => void,
  axisX = w / 2,
  axisY = h / 2
): void {
  fn(x, y);
  const mx = Math.round(2 * axisX - 1 - x);
  const my = Math.round(2 * axisY - 1 - y);
  if (mode === 'horizontal' || mode === 'quad') fn(mx, y);
  if (mode === 'vertical' || mode === 'quad') fn(x, my);
  if (mode === 'quad') fn(mx, my);
}

export function wrapCoord(
  x: number,
  y: number,
  w: number,
  h: number,
  tiled: boolean
): [number, number] {
  if (!tiled) return [x, y];
  return [((x % w) + w) % w, ((y % h) + h) % h];
}

export function inWritableBounds(
  x: number,
  y: number,
  w: number,
  h: number,
  selection: GridRect | null
): boolean {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  if (selection) {
    return (
      x >= selection.left &&
      x < selection.left + selection.width &&
      y >= selection.top &&
      y < selection.top + selection.height
    );
  }
  return true;
}

export function shiftArgbLightness(argb: number, delta: number): number {
  const a = (argb >>> 24) & 0xff;
  if (a === 0) return argb;
  const r = ((argb >>> 16) & 0xff) / 255;
  const g = ((argb >>> 8) & 0xff) / 255;
  const b = (argb & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  l = Math.max(0, Math.min(1, l + delta));

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let nr = l, ng = l, nb = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    nr = hue2rgb(p, q, h + 1 / 3);
    ng = hue2rgb(p, q, h);
    nb = hue2rgb(p, q, h - 1 / 3);
  }

  return (
    ((a << 24) |
      (Math.round(nr * 255) << 16) |
      (Math.round(ng * 255) << 8) |
      Math.round(nb * 255)) >>>
    0
  );
}

export function evalDeCasteljau(
  pts: Array<{ x: number; y: number }>,
  t: number
): { x: number; y: number } {
  let work = pts.map((p) => ({ ...p }));
  while (work.length > 1) {
    const next: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < work.length - 1; i++) {
      next.push({
        x: work[i].x + (work[i + 1].x - work[i].x) * t,
        y: work[i].y + (work[i + 1].y - work[i].y) * t,
      });
    }
    work = next;
  }
  return work[0];
}

export function applyOutline(
  pixels: Uint32Array,
  w: number,
  h: number,
  outlineColor: number,
  bounds?: GridRect | null
): { oldPixels: Map<number, number>; newPixels: Map<number, number> } {
  const oldPixels = new Map<number, number>();
  const newPixels = new Map<number, number>();
  if (((outlineColor >>> 24) & 0xff) === 0) return { oldPixels, newPixels };

  const x0 = bounds ? Math.max(0, bounds.left) : 0;
  const y0 = bounds ? Math.max(0, bounds.top) : 0;
  const x1 = bounds ? Math.min(w, bounds.left + bounds.width) : w;
  const y1 = bounds ? Math.min(h, bounds.top + bounds.height) : h;

  const snap = new Uint32Array(pixels);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = y * w + x;
      if (((snap[idx] >>> 24) & 0xff) !== 0) continue;
      let touchesOpaque = false;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= x0 && nx < x1 && ny >= y0 && ny < y1) {
          if (((snap[ny * w + nx] >>> 24) & 0xff) > 0) {
            touchesOpaque = true;
            break;
          }
        }
      }
      if (touchesOpaque && pixels[idx] !== outlineColor) {
        oldPixels.set(idx, pixels[idx]);
        newPixels.set(idx, outlineColor);
        pixels[idx] = outlineColor;
      }
    }
  }
  return { oldPixels, newPixels };
}

export function replaceColorInBuffer(
  pixels: Uint32Array,
  w: number,
  h: number,
  fromColor: number,
  toColor: number,
  bounds?: GridRect | null
): { oldPixels: Map<number, number>; newPixels: Map<number, number> } {
  const oldPixels = new Map<number, number>();
  const newPixels = new Map<number, number>();
  if (fromColor === toColor) return { oldPixels, newPixels };

  const x0 = bounds ? Math.max(0, bounds.left) : 0;
  const y0 = bounds ? Math.max(0, bounds.top) : 0;
  const x1 = bounds ? Math.min(w, bounds.left + bounds.width) : w;
  const y1 = bounds ? Math.min(h, bounds.top + bounds.height) : h;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = y * w + x;
      if (pixels[idx] === fromColor) {
        oldPixels.set(idx, pixels[idx]);
        newPixels.set(idx, toColor);
        pixels[idx] = toColor;
      }
    }
  }
  return { oldPixels, newPixels };
}

export function computeOpaqueBounds(project: PixelProject): GridRect | null {
  const frames = project.frames && project.frames.length > 0
    ? project.frames
    : [{ id: 'f0', layers: project.layers, groups: project.groups, activeLayerIndex: project.activeLayerIndex }];
  const w = project.width;
  const h = project.height;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (const f of frames) {
    for (const l of f.layers) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (((l.pixels[y * w + x] >>> 24) & 0xff) > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    left: minX,
    top: minY,
    width: Math.max(4, maxX - minX + 1),
    height: Math.max(4, maxY - minY + 1),
  };
}

export function resizeProjectCanvas(
  project: PixelProject,
  newW: number,
  newH: number,
  offsetX: number,
  offsetY: number
): PixelProject {
  const oldW = project.width;
  const oldH = project.height;
  const resizePixels = (src: Uint32Array): Uint32Array => {
    const dst = new Uint32Array(newW * newH);
    for (let y = 0; y < oldH; y++) {
      const ny = y + offsetY;
      if (ny < 0 || ny >= newH) continue;
      for (let x = 0; x < oldW; x++) {
        const nx = x + offsetX;
        if (nx < 0 || nx >= newW) continue;
        dst[ny * newW + nx] = src[y * oldW + x];
      }
    }
    return dst;
  };

  const frames = project.frames && project.frames.length > 0
    ? project.frames
    : [{ id: 'frame_0', layers: project.layers, groups: project.groups, activeLayerIndex: project.activeLayerIndex }];

  const curIdx = Math.max(0, Math.min(frames.length - 1, project.activeFrameIndex ?? 0));
  const nextFrames: PixelFrame[] = frames.map((f, idx) => {
    const srcLayers = idx === curIdx ? project.layers : f.layers;
    return {
      ...f,
      layers: srcLayers.map((l) => ({
        ...l,
        pixels: resizePixels(l.pixels),
      })),
    };
  });

  const activeFrame = nextFrames[curIdx];
  return {
    ...project,
    width: newW,
    height: newH,
    frames: nextFrames,
    layers: activeFrame.layers,
    groups: activeFrame.groups,
    activeLayerIndex: Math.min(project.activeLayerIndex, activeFrame.layers.length - 1),
  };
}

export function applyLayerPixelTransform(
  pixels: Uint32Array,
  w: number,
  h: number,
  mapDestIdx: (x: number, y: number, w: number, h: number) => number
): { oldPixels: Map<number, number>; newPixels: Map<number, number> } {
  const copy = new Uint32Array(pixels);
  const oldPixels = new Map<number, number>();
  const newPixels = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dst = mapDestIdx(x, y, w, h);
      const val = copy[y * w + x];
      if (pixels[dst] !== val) {
        oldPixels.set(dst, pixels[dst]);
        newPixels.set(dst, val);
        pixels[dst] = val;
      }
    }
  }
  return { oldPixels, newPixels };
}
