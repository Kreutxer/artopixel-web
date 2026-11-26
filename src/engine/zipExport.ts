import { buildApxlBlob } from './apxlFormat';
import { renderCompositeToCanvas } from './storage';
import { CanvasDoc, CanvasFolder, PixelProject } from './types';

export type ZipExportContent = 'png' | 'apxl' | 'both';

interface ZipEntry {
  path: string;
  data: Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time: dosTime, date: dosDate };
}

export function buildZipBlob(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const { time: dosTime, date: dosDate } = getDosDateTime();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(localHeader);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression method: 0 (STORE)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field length
    new Uint8Array(localHeader, 30).set(nameBytes);

    const localBytes = new Uint8Array(localHeader);
    localParts.push(localBytes, data);

    const centralHeader = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(centralHeader);
    cv.setUint32(0, 0x02014b50, true); // Central directory header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 filename flag
    cv.setUint16(10, 0, true); // Compression method: 0 (STORE)
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, offset, true); // Relative offset of local header
    new Uint8Array(centralHeader, 46).set(nameBytes);

    centralParts.push(new Uint8Array(centralHeader));
    offset += localBytes.length + data.length;
  }

  let centralSize = 0;
  for (const part of centralParts) centralSize += part.length;

  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true); // End of central directory signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Central directory start disk
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // Comment length

  return new Blob(
    [
      ...(localParts as BlobPart[]),
      ...(centralParts as BlobPart[]),
      new Uint8Array(eocd) as BlobPart,
    ],
    { type: 'application/zip' }
  );
}

export function sanitizePathSegment(name: string, fallback = 'untitled'): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '');
  return cleaned || fallback;
}

export function getFolderDescendantIds(folders: CanvasFolder[], rootFolderId: string): Set<string> {
  const ids = new Set<string>([rootFolderId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        added = true;
      }
    }
  }
  return ids;
}

export function getCanvasesForScope(project: PixelProject, scope: string): CanvasDoc[] {
  const canvases = project.canvases ?? [];
  if (scope === 'all') return canvases;
  const folderIds = getFolderDescendantIds(project.canvasFolders ?? [], scope);
  return canvases.filter((c) => c.folderId != null && folderIds.has(c.folderId));
}

function getRelativeFolderSegments(
  folderId: string | null | undefined,
  stopAtFolderId: string | null,
  folderMap: Map<string, CanvasFolder>
): string[] {
  const segments: string[] = [];
  const visited = new Set<string>();
  let currId = folderId ?? null;

  while (currId && currId !== stopAtFolderId) {
    if (visited.has(currId)) break;
    visited.add(currId);
    const folder = folderMap.get(currId);
    if (!folder) break;
    segments.unshift(sanitizePathSegment(folder.name, 'folder'));
    currId = folder.parentId ?? null;
  }

  return segments;
}

function canvasDocToStandaloneProject(
  project: PixelProject,
  canvasDoc: CanvasDoc,
  isActive: boolean
): PixelProject {
  if (isActive) {
    return {
      ...project,
      name: canvasDoc.name || project.name,
      canvases: undefined,
      canvasFolders: undefined,
      activeCanvasIndex: undefined,
    };
  }
  return {
    id: canvasDoc.id,
    name: canvasDoc.name,
    width: canvasDoc.width,
    height: canvasDoc.height,
    layers: canvasDoc.layers,
    groups: canvasDoc.groups,
    activeLayerIndex: canvasDoc.activeLayerIndex,
    frames: canvasDoc.frames,
    activeFrameIndex: canvasDoc.activeFrameIndex,
    fps: canvasDoc.fps,
    sharedPalette: project.sharedPalette,
    referenceDataUrl: null,
    referenceVisible: false,
    updatedAt: project.updatedAt,
  };
}

async function renderProjectPngBytes(standalone: PixelProject, scale: number): Promise<Uint8Array> {
  const base = document.createElement('canvas');
  renderCompositeToCanvas(standalone, base);

  const out = document.createElement('canvas');
  out.width = standalone.width * scale;
  out.height = standalone.height * scale;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D canvas context for PNG export.');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0, out.width, out.height);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to encode PNG blob.');
  return new Uint8Array(await blob.arrayBuffer());
}

export async function downloadFolderZip({
  project,
  scope,
  content,
  scale,
}: {
  project: PixelProject;
  scope: string;
  content: ZipExportContent;
  scale: number;
}): Promise<number> {
  const allCanvases = project.canvases ?? [];
  const folders = project.canvasFolders ?? [];
  const folderMap = new Map(folders.map((f) => [f.id, f]));
  const activeIdx = project.activeCanvasIndex ?? 0;

  const stopAtFolderId = scope === 'all' ? null : scope;
  const allowedFolderIds = stopAtFolderId ? getFolderDescendantIds(folders, stopAtFolderId) : null;

  const targets: Array<{ doc: CanvasDoc; isActive: boolean }> = [];
  allCanvases.forEach((doc, idx) => {
    if (allowedFolderIds) {
      if (doc.folderId && allowedFolderIds.has(doc.folderId)) {
        targets.push({ doc, isActive: idx === activeIdx });
      }
    } else {
      targets.push({ doc, isActive: idx === activeIdx });
    }
  });

  if (targets.length === 0) return 0;

  const usedBasePaths = new Set<string>();
  const entries: ZipEntry[] = [];

  for (const { doc, isActive } of targets) {
    const folderSegments = getRelativeFolderSegments(doc.folderId, stopAtFolderId, folderMap);
    const rawBaseName = sanitizePathSegment(doc.name, 'canvas');

    let uniqueName = rawBaseName;
    let suffix = 2;
    const prefix = folderSegments.length > 0 ? `${folderSegments.join('/')}/` : '';
    while (usedBasePaths.has(`${prefix}${uniqueName}`.toLowerCase())) {
      uniqueName = `${rawBaseName} (${suffix})`;
      suffix++;
    }
    const basePath = `${prefix}${uniqueName}`;
    usedBasePaths.add(basePath.toLowerCase());

    const standalone = canvasDocToStandaloneProject(project, doc, isActive);

    if (content === 'png' || content === 'both') {
      const pngBytes = await renderProjectPngBytes(standalone, scale);
      entries.push({
        path: content === 'both' ? `png/${basePath}.png` : `${basePath}.png`,
        data: pngBytes,
      });
    }

    if (content === 'apxl' || content === 'both') {
      const apxlBlob = await buildApxlBlob(standalone);
      const apxlBytes = new Uint8Array(await apxlBlob.arrayBuffer());
      entries.push({
        path: content === 'both' ? `source/${basePath}.apxl` : `${basePath}.apxl`,
        data: apxlBytes,
      });
    }
  }

  const zipBlob = buildZipBlob(entries);
  const archiveName =
    scope === 'all'
      ? sanitizePathSegment(project.name, 'project')
      : sanitizePathSegment(folderMap.get(scope)?.name ?? 'folder', 'folder');

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${archiveName}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  return targets.length;
}
