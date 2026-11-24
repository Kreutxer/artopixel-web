import { PixelFrame, PixelLayer, PixelProject, SavedPalette } from './types';

const DB_NAME = 'artopixel_web_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_PALETTES = 'palettes';
const THEME_KEY = 'artopixel_theme';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PALETTES)) {
        db.createObjectStore(STORE_PALETTES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface SerializedProject {
  id: string;
  name: string;
  width: number;
  height: number;
  activeLayerIndex: number;
  referenceDataUrl: string | null;
  referenceVisible: boolean;
  updatedAt: number;
  groups: PixelProject['groups'];
  layers: Array<{
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    groupId: string | null;
    pixels: number[];
  }>;
}

function serializeProject(p: PixelProject): SerializedProject {
  return {
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    activeLayerIndex: p.activeLayerIndex,
    referenceDataUrl: p.referenceDataUrl,
    referenceVisible: p.referenceVisible,
    updatedAt: p.updatedAt,
    groups: p.groups,
    layers: p.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      groupId: l.groupId,
      pixels: Array.from(l.pixels),
    })),
  };
}

function deserializeProject(raw: SerializedProject): PixelProject {
  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    activeLayerIndex: raw.activeLayerIndex,
    referenceDataUrl: raw.referenceDataUrl ?? null,
    referenceVisible: raw.referenceVisible ?? true,
    updatedAt: raw.updatedAt ?? Date.now(),
    groups: raw.groups ?? [],
    layers: raw.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      groupId: l.groupId ?? null,
      pixels: new Uint32Array(l.pixels),
    })),
  };
}

export function loadThemePreference(): 'light' | 'dark' {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'dark' ? 'dark' : 'light';
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  localStorage.setItem(THEME_KEY, theme);
}

export async function loadAllProjects(): Promise<PixelProject[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const req = tx.objectStore(STORE_PROJECTS).getAll();
    req.onsuccess = () => {
      const list = (req.result as SerializedProject[]).map(deserializeProject);
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(project: PixelProject): Promise<void> {
  project.updatedAt = Date.now();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).put(serializeProject(project));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadCustomPalettes(): Promise<SavedPalette[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PALETTES, 'readonly');
    const req = tx.objectStore(STORE_PALETTES).getAll();
    req.onsuccess = () => resolve(req.result as SavedPalette[]);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomPalette(palette: SavedPalette): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PALETTES, 'readwrite');
    tx.objectStore(STORE_PALETTES).put(palette);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCustomPalette(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PALETTES, 'readwrite');
    tx.objectStore(STORE_PALETTES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isLayerEffectivelyVisible(
  groups: PixelProject['groups'],
  layer: PixelLayer
): boolean {
  if (!layer.visible) return false;
  if (!layer.groupId) return true;
  const g = groups.find((gr) => gr.id === layer.groupId);
  return !g || g.visible;
}

let compositeScratchImg: ImageData | null = null;

export function renderFrameToCanvas(
  w: number,
  h: number,
  frame: Pick<PixelFrame, 'layers' | 'groups'>,
  target: HTMLCanvasElement,
  dimOthers?: { activeIdx: number; factor: number }
): void {
  if (target.width !== w) target.width = w;
  if (target.height !== h) target.height = h;
  const ctx = target.getContext('2d');
  if (!ctx) return;

  if (!compositeScratchImg || compositeScratchImg.width !== w || compositeScratchImg.height !== h) {
    compositeScratchImg = new ImageData(w, h);
  } else {
    compositeScratchImg.data.fill(0);
  }
  const out = compositeScratchImg.data;
  for (let lIdx = 0; lIdx < frame.layers.length; lIdx++) {
    const layer = frame.layers[lIdx];
    if (!isLayerEffectivelyVisible(frame.groups, layer) || layer.opacity <= 0) continue;
    const dimMul = dimOthers && lIdx !== dimOthers.activeIdx ? dimOthers.factor : 1;
    const layerOp = layer.opacity * dimMul;
    if (layerOp <= 0) continue;
    const px = layer.pixels;
    for (let i = 0; i < w * h; i++) {
      const argb = px[i];
      const srcA = (((argb >>> 24) & 0xff) / 255) * layerOp;
      if (srcA <= 0) continue;

      const srcR = (argb >>> 16) & 0xff;
      const srcG = (argb >>> 8) & 0xff;
      const srcB = argb & 0xff;

      const off = i * 4;
      const dstA = out[off + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA > 0) {
        out[off] = Math.round((srcR * srcA + out[off] * dstA * (1 - srcA)) / outA);
        out[off + 1] = Math.round(
          (srcG * srcA + out[off + 1] * dstA * (1 - srcA)) / outA
        );
        out[off + 2] = Math.round(
          (srcB * srcA + out[off + 2] * dstA * (1 - srcA)) / outA
        );
        out[off + 3] = Math.round(outA * 255);
      }
    }
  }
  ctx.putImageData(compositeScratchImg!, 0, 0);
}

export function renderCompositeToCanvas(
  project: PixelProject,
  target: HTMLCanvasElement,
  dimOthers?: { activeIdx: number; factor: number }
): void {
  renderFrameToCanvas(
    project.width,
    project.height,
    { layers: project.layers, groups: project.groups },
    target,
    dimOthers
  );
}

export function downloadProjectPng(project: PixelProject, scale: number): void {
  const base = document.createElement('canvas');
  renderCompositeToCanvas(project, base);

  const out = document.createElement('canvas');
  out.width = project.width * scale;
  out.height = project.height * scale;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0, out.width, out.height);

  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprite';
    a.href = url;
    a.download = `${safeName}_${scale}x.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
