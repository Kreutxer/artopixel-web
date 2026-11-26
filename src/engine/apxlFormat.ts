import { CanvasDoc, PixelFrame, PixelLayer, PixelProject } from './types';

interface ApxlLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  alphaLocked?: boolean;
  groupId: string | null;
  pixelsB64: string;
}

interface ApxlFrame {
  id: string;
  layers: ApxlLayer[];
  groups: PixelProject['groups'];
  activeLayerIndex: number;
}

interface ApxlCanvas {
  id: string;
  name: string;
  width: number;
  height: number;
  activeLayerIndex: number;
  activeFrameIndex?: number;
  fps?: number;
  groups: PixelProject['groups'];
  layers: ApxlLayer[];
  frames?: ApxlFrame[];
}

interface ApxlDocument {
  format: 'artopixel-apxl';
  version: 1;
  name: string;
  width: number;
  height: number;
  activeLayerIndex: number;
  activeFrameIndex?: number;
  fps?: number;
  canvases?: ApxlCanvas[];
  activeCanvasIndex?: number;
  sharedPalette?: number[];
  referenceDataUrl: string | null;
  referenceVisible: boolean;
  updatedAt: number;
  groups: PixelProject['groups'];
  layers: ApxlLayer[];
  frames?: ApxlFrame[];
}

function uint32ToBase64(arr: Uint32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToUint32(b64: string, pixelCount: number): Uint32Array {
  const binary = atob(b64);
  const expectedBytes = pixelCount * 4;
  if (binary.length !== expectedBytes) {
    throw new Error('Corrupted .apxl pixel data length.');
  }
  const bytes = new Uint8Array(expectedBytes);
  for (let i = 0; i < expectedBytes; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Uint32Array(bytes.buffer);
}

function encodeLayer(l: PixelLayer): ApxlLayer {
  return {
    id: l.id,
    name: l.name,
    visible: l.visible,
    opacity: l.opacity,
    alphaLocked: l.alphaLocked ?? false,
    groupId: l.groupId,
    pixelsB64: uint32ToBase64(l.pixels),
  };
}

function decodeLayer(l: ApxlLayer, pixelCount: number): PixelLayer {
  return {
    id: l.id,
    name: l.name,
    visible: l.visible,
    opacity: l.opacity,
    alphaLocked: l.alphaLocked ?? false,
    groupId: l.groupId ?? null,
    pixels: base64ToUint32(l.pixelsB64, pixelCount),
  };
}

function encodeCanvasFrames(c: {
  layers: PixelLayer[];
  groups: PixelProject['groups'];
  activeLayerIndex: number;
  frames?: PixelFrame[];
  activeFrameIndex?: number;
}) {
  const activeIdx = Math.max(0, Math.min(c.activeFrameIndex ?? 0, (c.frames?.length ?? 1) - 1));
  const frames: ApxlFrame[] | undefined = c.frames?.map((f, idx) =>
    idx === activeIdx
      ? {
          id: f.id,
          layers: c.layers.map(encodeLayer),
          groups: c.groups,
          activeLayerIndex: c.activeLayerIndex,
        }
      : {
          id: f.id,
          layers: f.layers.map(encodeLayer),
          groups: f.groups,
          activeLayerIndex: f.activeLayerIndex,
        }
  );
  return {
    frames,
    activeIdx: c.frames ? activeIdx : undefined,
    layers: c.layers.map(encodeLayer),
  };
}

export async function buildApxlBlob(project: PixelProject): Promise<Blob> {
  const topEncoded = encodeCanvasFrames(project);
  const activeCanvasIdx =
    project.canvases && project.canvases.length > 0
      ? Math.max(0, Math.min(project.activeCanvasIndex ?? 0, project.canvases.length - 1))
      : undefined;
  const canvases: ApxlCanvas[] | undefined = project.canvases?.map((c, idx) => {
    if (idx === activeCanvasIdx) {
      return {
        id: c.id,
        name: c.name,
        width: project.width,
        height: project.height,
        activeLayerIndex: project.activeLayerIndex,
        activeFrameIndex: topEncoded.activeIdx,
        fps: project.fps,
        groups: project.groups,
        layers: topEncoded.layers,
        frames: topEncoded.frames,
      };
    }
    const enc = encodeCanvasFrames(c);
    return {
      id: c.id,
      name: c.name,
      width: c.width,
      height: c.height,
      activeLayerIndex: c.activeLayerIndex,
      activeFrameIndex: enc.activeIdx,
      fps: c.fps,
      groups: c.groups,
      layers: enc.layers,
      frames: enc.frames,
    };
  });

  const doc: ApxlDocument = {
    format: 'artopixel-apxl',
    version: 1,
    name: project.name,
    width: project.width,
    height: project.height,
    activeLayerIndex: project.activeLayerIndex,
    activeFrameIndex: topEncoded.activeIdx,
    fps: project.fps,
    canvases,
    activeCanvasIndex: activeCanvasIdx,
    sharedPalette: project.sharedPalette,
    referenceDataUrl: project.referenceDataUrl,
    referenceVisible: project.referenceVisible,
    updatedAt: project.updatedAt,
    groups: project.groups,
    layers: topEncoded.layers,
    frames: topEncoded.frames,
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(doc));
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const stream = new Blob([jsonBytes]).stream().pipeThrough(cs);
    return new Response(stream, {
      headers: { 'Content-Type': 'application/octet-stream' },
    }).blob();
  }
  return new Blob([jsonBytes], { type: 'application/json' });
}

export async function parseApxlBuffer(
  buffer: ArrayBuffer,
  fallbackName = 'Imported Sprite'
): Promise<PixelProject> {
  const u8 = new Uint8Array(buffer);
  let jsonText: string;

  if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot decompress gzipped .apxl files.');
    }
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    jsonText = await new Response(stream).text();
  } else {
    jsonText = new TextDecoder().decode(u8);
  }

  let parsed: ApxlDocument;
  try {
    parsed = JSON.parse(jsonText) as ApxlDocument;
  } catch {
    throw new Error('Invalid .apxl file format.');
  }

  if (parsed.format !== 'artopixel-apxl' || parsed.version !== 1) {
    throw new Error('Unsupported .apxl file version.');
  }
  if (
    typeof parsed.width !== 'number' ||
    typeof parsed.height !== 'number' ||
    parsed.width < 4 ||
    parsed.height < 4 ||
    parsed.width > 1024 ||
    parsed.height > 1024
  ) {
    throw new Error('Invalid canvas dimensions in .apxl file.');
  }

  const decodeCanvas = (c: ApxlCanvas): CanvasDoc => {
    const pc = c.width * c.height;
    const cFrames: PixelFrame[] | undefined = c.frames?.map((f) => ({
      id: f.id,
      layers: f.layers.map((l) => decodeLayer(l, pc)),
      groups: f.groups ?? [],
      activeLayerIndex: f.activeLayerIndex ?? 0,
    }));
    const cActiveFrameIdx =
      cFrames && cFrames.length > 0
        ? Math.max(0, Math.min(c.activeFrameIndex ?? 0, cFrames.length - 1))
        : undefined;
    const cActiveFrame =
      cFrames && cActiveFrameIdx !== undefined ? cFrames[cActiveFrameIdx] : undefined;
    return {
      id: c.id,
      name: c.name,
      width: c.width,
      height: c.height,
      activeLayerIndex: cActiveFrame?.activeLayerIndex ?? c.activeLayerIndex ?? 0,
      frames: cFrames,
      activeFrameIndex: cActiveFrameIdx,
      fps: c.fps,
      groups: cActiveFrame?.groups ?? c.groups ?? [],
      layers: cActiveFrame?.layers ?? c.layers.map((l) => decodeLayer(l, pc)),
    };
  };

  const canvases: CanvasDoc[] | undefined = parsed.canvases?.map(decodeCanvas);
  const activeCanvasIndex =
    canvases && canvases.length > 0
      ? Math.max(0, Math.min(parsed.activeCanvasIndex ?? 0, canvases.length - 1))
      : undefined;
  const activeCanvas =
    canvases && activeCanvasIndex !== undefined ? canvases[activeCanvasIndex] : undefined;

  if (activeCanvas) {
    return {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: parsed.name?.trim() || fallbackName,
      width: activeCanvas.width,
      height: activeCanvas.height,
      activeLayerIndex: activeCanvas.activeLayerIndex,
      frames: activeCanvas.frames,
      activeFrameIndex: activeCanvas.activeFrameIndex,
      fps: activeCanvas.fps,
      canvases,
      activeCanvasIndex,
      sharedPalette: parsed.sharedPalette,
      referenceDataUrl: parsed.referenceDataUrl ?? null,
      referenceVisible: parsed.referenceVisible ?? true,
      updatedAt: Date.now(),
      groups: activeCanvas.groups,
      layers: activeCanvas.layers,
    };
  }

  const pixelCount = parsed.width * parsed.height;
  const frames: PixelFrame[] | undefined = parsed.frames?.map((f) => ({
    id: f.id,
    layers: f.layers.map((l) => decodeLayer(l, pixelCount)),
    groups: f.groups ?? [],
    activeLayerIndex: f.activeLayerIndex ?? 0,
  }));

  const activeFrameIndex =
    frames && frames.length > 0
      ? Math.max(0, Math.min(parsed.activeFrameIndex ?? 0, frames.length - 1))
      : undefined;
  const activeFrame =
    frames && activeFrameIndex !== undefined ? frames[activeFrameIndex] : undefined;

  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: parsed.name?.trim() || fallbackName,
    width: parsed.width,
    height: parsed.height,
    activeLayerIndex: activeFrame?.activeLayerIndex ?? parsed.activeLayerIndex ?? 0,
    frames,
    activeFrameIndex,
    fps: parsed.fps,
    sharedPalette: parsed.sharedPalette,
    referenceDataUrl: parsed.referenceDataUrl ?? null,
    referenceVisible: parsed.referenceVisible ?? true,
    updatedAt: Date.now(),
    groups: activeFrame?.groups ?? parsed.groups ?? [],
    layers: activeFrame?.layers ?? parsed.layers.map((l) => decodeLayer(l, pixelCount)),
  };
}

export async function downloadProjectApxl(project: PixelProject): Promise<string> {
  const blob = await buildApxlBlob(project);
  const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprite';
  const fileName = `${safeName}.apxl`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return fileName;
}
