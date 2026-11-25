import { buildApxlBlob, downloadProjectApxl } from './apxlFormat';
import { PixelFrame, PixelLayer, PixelProject, SavedPalette } from './types';

const DB_NAME = 'artopixel_web_db';
const DB_VERSION = 2;
const STORE_PROJECTS = 'projects';
const STORE_PALETTES = 'palettes';
const STORE_HANDLES = 'file_handles';
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
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'projectId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface SerializedLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  alphaLocked?: boolean;
  groupId: string | null;
  pixels: Uint32Array | number[];
}

interface SerializedFrame {
  id: string;
  layers: SerializedLayer[];
  groups: PixelProject['groups'];
  activeLayerIndex: number;
}

interface SerializedProject {
  id: string;
  name: string;
  width: number;
  height: number;
  activeLayerIndex: number;
  frames?: SerializedFrame[];
  activeFrameIndex?: number;
  fps?: number;
  referenceDataUrl: string | null;
  referenceVisible: boolean;
  updatedAt: number;
  groups: PixelProject['groups'];
  layers: SerializedLayer[];
}

function serializeLayer(l: PixelLayer): SerializedLayer {
  return {
    id: l.id,
    name: l.name,
    visible: l.visible,
    opacity: l.opacity,
    alphaLocked: l.alphaLocked ?? false,
    groupId: l.groupId,
    pixels: l.pixels,
  };
}

function deserializeLayer(l: SerializedLayer): PixelLayer {
  return {
    id: l.id,
    name: l.name,
    visible: l.visible,
    opacity: l.opacity,
    alphaLocked: l.alphaLocked ?? false,
    groupId: l.groupId ?? null,
    pixels: new Uint32Array(l.pixels),
  };
}

function serializeProject(p: PixelProject): SerializedProject {
  const activeIdx = Math.max(0, Math.min(p.activeFrameIndex ?? 0, (p.frames?.length ?? 1) - 1));
  const serializedFrames: SerializedFrame[] | undefined = p.frames?.map((f, idx) =>
    idx === activeIdx
      ? {
          id: f.id,
          layers: p.layers.map(serializeLayer),
          groups: p.groups,
          activeLayerIndex: p.activeLayerIndex,
        }
      : {
          id: f.id,
          layers: f.layers.map(serializeLayer),
          groups: f.groups,
          activeLayerIndex: f.activeLayerIndex,
        }
  );

  return {
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    activeLayerIndex: p.activeLayerIndex,
    frames: serializedFrames,
    activeFrameIndex: p.frames ? activeIdx : undefined,
    fps: p.fps,
    referenceDataUrl: p.referenceDataUrl,
    referenceVisible: p.referenceVisible,
    updatedAt: p.updatedAt,
    groups: p.groups,
    layers: p.layers.map(serializeLayer),
  };
}

function deserializeProject(raw: SerializedProject): PixelProject {
  const frames: PixelFrame[] | undefined = raw.frames?.map((f) => ({
    id: f.id,
    layers: f.layers.map(deserializeLayer),
    groups: f.groups ?? [],
    activeLayerIndex: f.activeLayerIndex ?? 0,
  }));
  const activeFrameIndex =
    frames && frames.length > 0
      ? Math.max(0, Math.min(raw.activeFrameIndex ?? 0, frames.length - 1))
      : undefined;
  const activeFrame =
    frames && activeFrameIndex !== undefined ? frames[activeFrameIndex] : undefined;

  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    activeLayerIndex: activeFrame?.activeLayerIndex ?? raw.activeLayerIndex,
    frames,
    activeFrameIndex,
    fps: raw.fps,
    referenceDataUrl: raw.referenceDataUrl ?? null,
    referenceVisible: raw.referenceVisible ?? true,
    updatedAt: raw.updatedAt ?? Date.now(),
    groups: activeFrame?.groups ?? raw.groups ?? [],
    layers: activeFrame?.layers ?? raw.layers.map(deserializeLayer),
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
    const tx = db.transaction([STORE_PROJECTS, STORE_HANDLES], 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(id);
    tx.objectStore(STORE_HANDLES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

interface HandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface ExtendedFileHandle extends FileSystemFileHandle {
  queryPermission?: (descriptor?: HandlePermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor?: HandlePermissionDescriptor) => Promise<PermissionState>;
}

interface PickerWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<ExtendedFileHandle>;
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';
}

export async function loadFileHandle(projectId: string): Promise<ExtendedFileHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_HANDLES, 'readonly');
      const req = tx.objectStore(STORE_HANDLES).get(projectId);
      req.onsuccess = () => {
        const rec = req.result as { projectId: string; handle: ExtendedFileHandle } | undefined;
        resolve(rec?.handle ?? null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveFileHandle(projectId: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANDLES, 'readwrite');
    tx.objectStore(STORE_HANDLES).put({ projectId, handle });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveProjectToDisk(
  project: PixelProject,
  opts?: { saveAs?: boolean }
): Promise<{ status: 'saved'; fileName: string; method: 'handle' | 'download' } | { status: 'cancelled' }> {
  const pickerWin = window as PickerWindow;
  if (!pickerWin.showSaveFilePicker) {
    const fileName = await downloadProjectApxl(project);
    return { status: 'saved', fileName, method: 'download' };
  }

  let handle: ExtendedFileHandle | null = opts?.saveAs ? null : await loadFileHandle(project.id);

  if (handle) {
    try {
      const perm = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
      if (perm !== 'granted') {
        const requested = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
        if (requested !== 'granted') {
          handle = null;
        }
      }
    } catch {
      handle = null;
    }
  }

  if (!handle) {
    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprite';
    try {
      handle = await pickerWin.showSaveFilePicker({
        suggestedName: `${safeName}.apxl`,
        types: [
          {
            description: 'ArtoPixel Project (.apxl)',
            accept: { 'application/octet-stream': ['.apxl'] },
          },
        ],
      });
      await saveFileHandle(project.id, handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      throw err;
    }
  }

  const blob = await buildApxlBlob(project);
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return { status: 'saved', fileName: handle.name, method: 'handle' };
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
