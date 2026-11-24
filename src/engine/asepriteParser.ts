import { LayerGroup, PixelLayer, PixelProject } from './types';

async function inflateZlib(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  writer.write(copy);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

function readString(view: DataView, offset: number): { value: string; next: number } {
  const len = view.getUint16(offset, true);
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + 2, len);
  const value = new TextDecoder().decode(bytes);
  return { value, next: offset + 2 + len };
}

export async function parseAsepriteBuffer(
  buffer: ArrayBuffer,
  fallbackName: string
): Promise<{ project: PixelProject; palette: number[] }> {
  const view = new DataView(buffer);
  if (buffer.byteLength < 128) {
    throw new Error('File is too small to be a valid Aseprite file.');
  }

  const magic = view.getUint16(4, true);
  if (magic !== 0xa5e0) {
    throw new Error('Invalid Aseprite magic header.');
  }

  const frames = view.getUint16(6, true);
  const width = view.getUint16(8, true);
  const height = view.getUint16(10, true);
  const colorDepth = view.getUint16(12, true);
  const transparentIndex = view.getUint8(28);

  if (width < 4 || height < 4 || width > 1024 || height > 1024) {
    throw new Error(
      `Canvas size must be between 4×4 and 1024×1024 (got ${width}×${height}).`
    );
  }
  if (colorDepth !== 32 && colorDepth !== 16 && colorDepth !== 8) {
    throw new Error(`Unsupported color depth: ${colorDepth}bpp.`);
  }
  if (frames < 1) {
    throw new Error('Aseprite file contains no frames.');
  }

  // Read Frame 1 (frames[0])
  let offset = 128;
  const frameMagic = view.getUint16(offset + 4, true);
  if (frameMagic !== 0xf1fa) {
    throw new Error('Invalid Aseprite frame header.');
  }
  const oldChunks = view.getUint16(offset + 6, true);
  const newChunks = view.getUint32(offset + 12, true);
  const numChunks = newChunks !== 0 ? newChunks : oldChunks;
  offset += 16;

  const palette: number[] = new Array(256).fill(0xff000000);
  let hasPalette = false;

  const groups: LayerGroup[] = [];
  let currentGroupId: string | null = null;
  let rawLayerCount = 0;
  const rawIndexToPixelLayer = new Map<number, PixelLayer>();
  const layers: PixelLayer[] = [];

  for (let c = 0; c < numChunks; c++) {
    if (offset + 6 > buffer.byteLength) break;
    const chunkSize = view.getUint32(offset, true);
    const chunkType = view.getUint16(offset + 4, true);
    const dataStart = offset + 6;
    const chunkEnd = offset + chunkSize;

    if (chunkType === 0x2019) {
      // Modern Palette Chunk
      hasPalette = true;
      const firstIdx = view.getUint32(dataStart + 4, true);
      const lastIdx = view.getUint32(dataStart + 8, true);
      let pOff = dataStart + 20;
      for (let idx = firstIdx; idx <= lastIdx && pOff + 6 <= chunkEnd; idx++) {
        const entryFlags = view.getUint16(pOff, true);
        const r = view.getUint8(pOff + 2);
        const g = view.getUint8(pOff + 3);
        const b = view.getUint8(pOff + 4);
        const a = view.getUint8(pOff + 5);
        pOff += 6;
        if (entryFlags & 1) {
          pOff = readString(view, pOff).next;
        }
        if (idx < palette.length) {
          palette[idx] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
        }
      }
    } else if ((chunkType === 0x0004 || chunkType === 0x0011) && !hasPalette) {
      // Old Palette Chunk
      const numPackets = view.getUint16(dataStart, true);
      let pOff = dataStart + 2;
      let idx = 0;
      for (let p = 0; p < numPackets && pOff + 2 <= chunkEnd; p++) {
        idx += view.getUint8(pOff);
        const count = view.getUint8(pOff + 1) || 256;
        pOff += 2;
        for (let k = 0; k < count && pOff + 3 <= chunkEnd; k++) {
          let r = view.getUint8(pOff);
          let g = view.getUint8(pOff + 1);
          let b = view.getUint8(pOff + 2);
          if (chunkType === 0x0011) {
            r = Math.round((r * 255) / 63);
            g = Math.round((g * 255) / 63);
            b = Math.round((b * 255) / 63);
          }
          if (idx < palette.length) {
            palette[idx] = ((255 << 24) | (r << 16) | (g << 8) | b) >>> 0;
          }
          idx++;
          pOff += 3;
        }
      }
      hasPalette = true;
    } else if (chunkType === 0x2004) {
      // Layer Chunk
      const flags = view.getUint16(dataStart, true);
      const layerType = view.getUint16(dataStart + 2, true);
      const childLevel = view.getUint16(dataStart + 4, true);
      const opacityByte = view.getUint8(dataStart + 12);
      const { value: layerName } = readString(view, dataStart + 16);
      const visible = (flags & 1) !== 0;

      if (layerType === 1) {
        if (childLevel === 0) {
          const gid = `grp_${Date.now()}_${groups.length}`;
          groups.push({
            id: gid,
            name: layerName || `Group ${groups.length + 1}`,
            visible,
            collapsed: false,
          });
          currentGroupId = gid;
        }
      } else if (layerType === 0) {
        if (childLevel === 0) currentGroupId = null;
        const layer: PixelLayer = {
          id: `layer_${Date.now()}_${layers.length}`,
          name: layerName || `Layer ${layers.length + 1}`,
          visible,
          opacity: Math.max(0, Math.min(1, opacityByte / 255)),
          groupId: childLevel > 0 ? currentGroupId : null,
          pixels: new Uint32Array(width * height),
        };
        layers.push(layer);
        rawIndexToPixelLayer.set(rawLayerCount, layer);
      }
      rawLayerCount++;
    } else if (chunkType === 0x2005) {
      // Cel Chunk
      const layerIndex = view.getUint16(dataStart, true);
      const celX = view.getInt16(dataStart + 2, true);
      const celY = view.getInt16(dataStart + 4, true);
      const celType = view.getUint16(dataStart + 7, true);
      const targetLayer = rawIndexToPixelLayer.get(layerIndex);

      if (targetLayer && (celType === 0 || celType === 2)) {
        const celW = view.getUint16(dataStart + 16, true);
        const celH = view.getUint16(dataStart + 18, true);
        const rawSlice = new Uint8Array(
          buffer,
          dataStart + 20,
          Math.max(0, chunkEnd - (dataStart + 20))
        );
        const pixelBytes = celType === 2 ? await inflateZlib(rawSlice) : rawSlice;
        const bpp = colorDepth / 8;

        for (let py = 0; py < celH; py++) {
          const dy = celY + py;
          if (dy < 0 || dy >= height) continue;
          for (let px = 0; px < celW; px++) {
            const dx = celX + px;
            if (dx < 0 || dx >= width) continue;
            const srcOff = (py * celW + px) * bpp;
            if (srcOff + bpp > pixelBytes.length) continue;

            let argb = 0;
            if (colorDepth === 32) {
              const r = pixelBytes[srcOff];
              const g = pixelBytes[srcOff + 1];
              const b = pixelBytes[srcOff + 2];
              const a = pixelBytes[srcOff + 3];
              argb = a === 0 ? 0 : (((a << 24) | (r << 16) | (g << 8) | b) >>> 0);
            } else if (colorDepth === 16) {
              const v = pixelBytes[srcOff];
              const a = pixelBytes[srcOff + 1];
              argb = a === 0 ? 0 : (((a << 24) | (v << 16) | (v << 8) | v) >>> 0);
            } else {
              const idx = pixelBytes[srcOff];
              argb = idx === transparentIndex ? 0 : (palette[idx] ?? 0);
            }
            if (argb !== 0) {
              targetLayer.pixels[dy * width + dx] = argb;
            }
          }
        }
      }
    }

    offset = chunkEnd;
  }

  if (layers.length === 0) {
    layers.push({
      id: 'layer_1',
      name: 'Layer 1',
      visible: true,
      opacity: 1,
      groupId: null,
      pixels: new Uint32Array(width * height),
    });
  }

  const project: PixelProject = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: fallbackName,
    width,
    height,
    layers,
    groups,
    activeLayerIndex: layers.length - 1,
    referenceDataUrl: null,
    referenceVisible: true,
    updatedAt: Date.now(),
  };

  return {
    project,
    palette: hasPalette ? palette.slice(0, 32).filter((c) => (c >>> 24) > 0) : [],
  };
}

async function deflateZlib(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  writer.write(copy);
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

function makeChunk(type: number, payload: Uint8Array): Uint8Array {
  const size = 6 + payload.byteLength;
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  view.setUint32(0, size, true);
  view.setUint16(4, type, true);
  buf.set(payload, 6);
  return buf;
}

function makeLayerChunk(
  name: string,
  visible: boolean,
  layerType: number,
  childLevel: number,
  opacityByte: number
): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const payload = new Uint8Array(18 + nameBytes.length);
  const view = new DataView(payload.buffer);
  view.setUint16(0, visible ? 1 : 0, true);
  view.setUint16(2, layerType, true);
  view.setUint16(4, childLevel, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint8(12, opacityByte);
  view.setUint16(16, nameBytes.length, true);
  payload.set(nameBytes, 18);
  return makeChunk(0x2004, payload);
}

export async function buildAsepriteBuffer(
  project: PixelProject,
  palette: number[] = []
): Promise<Uint8Array> {
  const w = project.width;
  const h = project.height;
  const frames =
    project.frames && project.frames.length > 0
      ? project.frames
      : [
          {
            id: 'frame_1',
            layers: project.layers,
            groups: project.groups,
            activeLayerIndex: project.activeLayerIndex,
          },
        ];
  const speedMs = Math.max(20, Math.round(1000 / Math.max(1, project.fps ?? 8)));

  // Build Frame 0 palette + layer chunks from Frame 0
  const frame0 = frames[0];
  const frame0Chunks: Uint8Array[] = [];

  if (palette.length > 0) {
    const count = Math.min(256, palette.length);
    const palPayload = new Uint8Array(20 + count * 6);
    const pv = new DataView(palPayload.buffer);
    pv.setUint32(0, count, true);
    pv.setUint32(4, 0, true);
    pv.setUint32(8, count - 1, true);
    for (let i = 0; i < count; i++) {
      const argb = palette[i];
      const off = 20 + i * 6;
      pv.setUint16(off, 0, true);
      pv.setUint8(off + 2, (argb >>> 16) & 0xff);
      pv.setUint8(off + 3, (argb >>> 8) & 0xff);
      pv.setUint8(off + 4, argb & 0xff);
      pv.setUint8(off + 5, (argb >>> 24) & 0xff);
    }
    frame0Chunks.push(makeChunk(0x2019, palPayload));
  }

  let rawLayerIdx = 0;
  let activeGroupId: string | null = null;
  const layerOrderToRawIdx: number[] = [];

  for (const layer of frame0.layers) {
    const group = layer.groupId
      ? frame0.groups.find((g) => g.id === layer.groupId)
      : undefined;
    if (group && group.id !== activeGroupId) {
      frame0Chunks.push(makeLayerChunk(group.name, group.visible, 1, 0, 255));
      rawLayerIdx++;
      activeGroupId = group.id;
    } else if (!group) {
      activeGroupId = null;
    }

    const opByte = Math.max(0, Math.min(255, Math.round(layer.opacity * 255)));
    frame0Chunks.push(
      makeLayerChunk(layer.name, layer.visible, 0, group ? 1 : 0, opByte)
    );
    layerOrderToRawIdx.push(rawLayerIdx);
    rawLayerIdx++;
  }

  const frameBlocks: Uint8Array[] = [];
  for (let fi = 0; fi < frames.length; fi++) {
    const fr = frames[fi];
    const chunks: Uint8Array[] = fi === 0 ? [...frame0Chunks] : [];

    for (let li = 0; li < Math.min(fr.layers.length, layerOrderToRawIdx.length); li++) {
      const layer = fr.layers[li];
      const rawIndex = layerOrderToRawIdx[li];
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const argb = layer.pixels[y * w + x];
          if (((argb >>> 24) & 0xff) > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX || maxY < minY) continue;

      const celW = maxX - minX + 1;
      const celH = maxY - minY + 1;
      const rgba = new Uint8Array(celW * celH * 4);
      for (let cy = 0; cy < celH; cy++) {
        for (let cx = 0; cx < celW; cx++) {
          const argb = layer.pixels[(minY + cy) * w + (minX + cx)];
          const dst = (cy * celW + cx) * 4;
          rgba[dst] = (argb >>> 16) & 0xff;
          rgba[dst + 1] = (argb >>> 8) & 0xff;
          rgba[dst + 2] = argb & 0xff;
          rgba[dst + 3] = (argb >>> 24) & 0xff;
        }
      }

      const compressed = await deflateZlib(rgba);
      const celPayload = new Uint8Array(20 + compressed.byteLength);
      const cv = new DataView(celPayload.buffer);
      cv.setUint16(0, rawIndex, true);
      cv.setInt16(2, minX, true);
      cv.setInt16(4, minY, true);
      cv.setUint8(6, 255);
      cv.setUint16(7, 2, true);
      cv.setInt16(9, 0, true);
      cv.setUint16(16, celW, true);
      cv.setUint16(18, celH, true);
      celPayload.set(compressed, 20);
      chunks.push(makeChunk(0x2005, celPayload));
    }

    let chunksByteLen = 0;
    for (const ch of chunks) chunksByteLen += ch.byteLength;
    const frameSize = 16 + chunksByteLen;
    const fb = new Uint8Array(frameSize);
    const fv = new DataView(fb.buffer);
    fv.setUint32(0, frameSize, true);
    fv.setUint16(4, 0xf1fa, true);
    fv.setUint16(6, Math.min(0xffff, chunks.length), true);
    fv.setUint16(8, speedMs, true);
    fv.setUint32(12, chunks.length, true);
    let writeOff = 16;
    for (const ch of chunks) {
      fb.set(ch, writeOff);
      writeOff += ch.byteLength;
    }
    frameBlocks.push(fb);
  }

  let totalFramesBytes = 0;
  for (const fb of frameBlocks) totalFramesBytes += fb.byteLength;
  const totalSize = 128 + totalFramesBytes;
  const fileBuf = new Uint8Array(totalSize);
  const hv = new DataView(fileBuf.buffer);

  // 128-byte Aseprite Header
  hv.setUint32(0, totalSize, true);
  hv.setUint16(4, 0xa5e0, true);
  hv.setUint16(6, frames.length, true);
  hv.setUint16(8, w, true);
  hv.setUint16(10, h, true);
  hv.setUint16(12, 32, true);
  hv.setUint32(14, 1, true);
  hv.setUint16(18, speedMs, true);
  hv.setUint8(28, 0);
  hv.setUint16(32, Math.min(256, palette.length), true);
  hv.setUint8(34, 1);
  hv.setUint8(35, 1);
  hv.setUint16(40, 16, true);
  hv.setUint16(42, 16, true);

  let writeOff = 128;
  for (const fb of frameBlocks) {
    fileBuf.set(fb, writeOff);
    writeOff += fb.byteLength;
  }

  return fileBuf;
}

export async function downloadProjectAseprite(
  project: PixelProject,
  palette: number[] = []
): Promise<void> {
  const bytes = await buildAsepriteBuffer(project, palette);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9_-]/gi, '_')}.aseprite`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
