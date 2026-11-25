import { MutableRefObject } from 'react';
import { argbToCss } from '../../engine/paletteQuantizer';
import { brushOffsets } from '../../engine/pixelEngine';
import { BrushShape, GridRect, MirrorMode, PixelProject, PixelTool } from '../../engine/types';

export interface ThemeCache {
  theme: string;
  cLight: string;
  cDark: string;
  accent: string;
  borderCol: string;
  selectionBlue: string;
  patCanvas: HTMLCanvasElement;
}

export interface HoveredLayerCache {
  key: string;
  edges: number[];
  minX: number;
  minY: number;
  name: string;
}

export type GridMode = 'off' | 'pixel' | 'tile' | 'both';

export interface DrawViewportParams {
  canvas: HTMLCanvasElement | null;
  project: PixelProject;
  zoom: number;
  pan: { x: number; y: number };
  tiledMode: boolean;
  gridMode: GridMode;
  mirror: MirrorMode;
  mirrorPos: { x: number; y: number };
  selection: GridRect | null;
  previewingSize: boolean;
  brushSize: number;
  brushShape: BrushShape;
  tool: PixelTool;
  activeColor: number;
  revision: number;
  theme: 'light' | 'dark';
  onionSkin: boolean;
  isPlaying: boolean;
  activeFrameId: string;
  compositeCanvas: HTMLCanvasElement;
  prevOnionCanvas: HTMLCanvasElement;
  nextOnionCanvas: HTMLCanvasElement;
  previewPixels: Map<number, number>;
  curveStart: { x: number; y: number } | null;
  curveEnd: { x: number; y: number } | null;
  curveControls: Array<{ x: number; y: number }>;
  hoverPt: [number, number] | null;
  isPanning: boolean;
  isScrubbing: boolean;
  isDraggingMirror: boolean;
  isDrawing: boolean;
  ctrlHeld: boolean;
  themeCacheRef: MutableRefObject<ThemeCache | null>;
  hoveredLayerCacheRef: MutableRefObject<HoveredLayerCache | null>;
}

export function renderEditorViewport(p: DrawViewportParams): void {
  const { canvas, project, zoom, pan } = p;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const w = project.width;
  const h = project.height;
  const cw = w * zoom;
  const ch = h * zoom;

  let cache = p.themeCacheRef.current;
  if (!cache || cache.theme !== p.theme) {
    const cs = getComputedStyle(document.documentElement);
    const cLight = cs.getPropertyValue('--checker-light').trim();
    const cDark = cs.getPropertyValue('--checker-dark').trim();
    const accent = cs.getPropertyValue('--accent').trim();
    const borderCol = cs.getPropertyValue('--border').trim();
    const selectionBlue = cs.getPropertyValue('--selection-blue').trim() || '#3b82f6';

    const patCanvas = document.createElement('canvas');
    patCanvas.width = 32;
    patCanvas.height = 32;
    const pctx = patCanvas.getContext('2d')!;
    pctx.fillStyle = cLight;
    pctx.fillRect(0, 0, 32, 32);
    pctx.fillStyle = cDark;
    pctx.fillRect(16, 0, 16, 16);
    pctx.fillRect(0, 16, 16, 16);

    cache = { theme: p.theme, cLight, cDark, accent, borderCol, selectionBlue, patCanvas };
    p.themeCacheRef.current = cache;
  }
  const { accent, borderCol, selectionBlue, patCanvas } = cache;

  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = borderCol;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();

  const pattern = ctx.createPattern(patCanvas, 'repeat');
  if (pattern) {
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (p.tiledMode) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    for (let ty = -1; ty <= 1; ty++) {
      for (let tx = -1; tx <= 1; tx++) {
        if (tx === 0 && ty === 0) continue;
        ctx.drawImage(p.compositeCanvas, tx * cw, ty * ch, cw, ch);
      }
    }
    ctx.restore();
  }

  if (p.onionSkin && !p.isPlaying) {
    const frames = project.frames ?? [];
    const fIdx = project.activeFrameIndex ?? 0;
    ctx.save();
    ctx.globalAlpha = 0.28;
    if (fIdx > 0 && frames[fIdx - 1]) {
      ctx.drawImage(p.prevOnionCanvas, 0, 0, cw, ch);
    }
    if (fIdx + 1 < frames.length && frames[fIdx + 1]) {
      ctx.drawImage(p.nextOnionCanvas, 0, 0, cw, ch);
    }
    ctx.restore();
  }

  ctx.drawImage(p.compositeCanvas, 0, 0, cw, ch);

  p.previewPixels.forEach((argb, idx) => {
    const px = idx % w;
    const py = Math.floor(idx / w);
    ctx.fillStyle = argbToCss(argb);
    ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
  });

  if (p.gridMode !== 'off') {
    const showPixel = p.gridMode === 'pixel' || p.gridMode === 'both';
    const showTile = p.gridMode === 'tile' || p.gridMode === 'both';

    if (showPixel && zoom >= 6) {
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.22)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let x = 1; x < w; x++) {
        if (showTile && x % 16 === 0) continue;
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, ch);
      }
      for (let y = 1; y < h; y++) {
        if (showTile && y % 16 === 0) continue;
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(cw, y * zoom);
      }
      ctx.stroke();
    }

    if (showTile && 16 * zoom >= 6 && (w > 16 || h > 16)) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.48)';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      for (let x = 16; x < w; x += 16) {
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, ch);
      }
      for (let y = 16; y < h; y += 16) {
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(cw, y * zoom);
      }
      ctx.stroke();
    }
  }

  if (p.mirror !== 'none') {
    const mx = p.mirrorPos.x * zoom;
    const my = p.mirrorPos.y * zoom;
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    if (p.mirror === 'horizontal' || p.mirror === 'quad') {
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, ch);
    }
    if (p.mirror === 'vertical' || p.mirror === 'quad') {
      ctx.moveTo(0, my);
      ctx.lineTo(cw, my);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    if (p.mirror === 'horizontal' || p.mirror === 'quad') {
      ctx.beginPath();
      ctx.moveTo(mx, -2);
      ctx.lineTo(mx - 7, -13);
      ctx.lineTo(mx + 7, -13);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (p.mirror === 'vertical' || p.mirror === 'quad') {
      ctx.beginPath();
      ctx.moveTo(-2, my);
      ctx.lineTo(-13, my - 7);
      ctx.lineTo(-13, my + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  if (p.selection) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      p.selection.left * zoom,
      p.selection.top * zoom,
      p.selection.width * zoom,
      p.selection.height * zoom
    );
    ctx.strokeStyle = accent;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      p.selection.left * zoom,
      p.selection.top * zoom,
      p.selection.width * zoom,
      p.selection.height * zoom
    );
    if (p.tool === 'marquee') {
      const sx = p.selection.left * zoom;
      const sy = p.selection.top * zoom;
      const sw = p.selection.width * zoom;
      const sh = p.selection.height * zoom;
      const pts: Array<[number, number]> = [
        [sx, sy],
        [sx + sw / 2, sy],
        [sx + sw, sy],
        [sx + sw, sy + sh / 2],
        [sx + sw, sy + sh],
        [sx + sw / 2, sy + sh],
        [sx, sy + sh],
        [sx, sy + sh / 2],
      ];
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      for (const [hx, hy] of pts) {
        ctx.fillRect(hx - 3.5, hy - 3.5, 7, 7);
        ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7);
      }
    }
    ctx.restore();
  }

  if (p.curveStart && p.curveEnd && p.curveControls.length > 0) {
    const pts = [p.curveStart, ...p.curveControls, p.curveEnd];
    ctx.save();
    ctx.strokeStyle = 'rgba(150,160,180,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const sx = (pt.x + 0.5) * zoom;
      const sy = (pt.y + 0.5) * zoom;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();

    pts.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc((pt.x + 0.5) * zoom, (pt.y + 0.5) * zoom, i === 0 || i === pts.length - 1 ? 4 : 5, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 || i === pts.length - 1 ? '#ffffff' : accent;
      ctx.fill();
    });
    ctx.restore();
  }

  ctx.strokeStyle = p.tiledMode ? accent : borderCol;
  ctx.lineWidth = p.tiledMode ? 1.6 : 1.2;
  ctx.strokeRect(0, 0, cw, ch);

  if (p.previewingSize) {
    const [cx, cy] = p.hoverPt ?? [Math.floor(w / 2), Math.floor(h / 2)];
    ctx.save();
    ctx.fillStyle = p.tool === 'eraser' ? 'rgba(255,255,255,0.28)' : argbToCss(p.activeColor);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    if (p.brushSize <= 16) {
      const offsets = brushOffsets(p.brushSize, p.brushShape);
      for (const [dx, dy] of offsets) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
        ctx.fillRect(gx * zoom, gy * zoom, zoom, zoom);
        ctx.strokeRect(gx * zoom, gy * zoom, zoom, zoom);
      }
    } else {
      const startOff = -Math.floor((p.brushSize - 1) / 2);
      const rx = (cx + startOff) * zoom;
      const ry = (cy + startOff) * zoom;
      const rSize = p.brushSize * zoom;
      ctx.globalAlpha = 0.5;
      if (p.brushShape === 'round') {
        ctx.beginPath();
        ctx.arc(rx + rSize / 2, ry + rSize / 2, rSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
      } else {
        ctx.fillRect(rx, ry, rSize, rSize);
        ctx.globalAlpha = 1;
        ctx.strokeRect(rx, ry, rSize, rSize);
      }
    }

    const startOff = p.brushSize <= 1 ? 0 : -Math.floor((p.brushSize - 1) / 2);
    const rx = (cx + startOff) * zoom;
    const ry = (cy + startOff) * zoom;
    const rSize = p.brushSize * zoom;
    const label = `${p.brushSize}px`;
    ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const tw = ctx.measureText(label).width;
    const pillW = tw + 12;
    const pillH = 20;
    const pillX = rx + rSize / 2 - pillW / 2;
    const pillY = rSize >= 54 ? ry + rSize / 2 - pillH / 2 : ry - pillH - 6;
    ctx.fillStyle = 'rgba(20, 23, 31, 0.88)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
    ctx.restore();
  }

  if (p.hoverPt && !p.isPanning && !p.isScrubbing && !p.isDraggingMirror) {
    const [hx, hy] = p.hoverPt;
    if (p.tiledMode || (hx >= 0 && hy >= 0 && hx < w && hy < h)) {
      const isBrushSized =
        p.tool === 'pencil' || p.tool === 'eraser' || p.tool === 'shade' || p.tool === 'line';
      const size = isBrushSized ? p.brushSize : 1;
      const startOff = size <= 1 ? 0 : -Math.floor((size - 1) / 2);
      ctx.save();
      if (isBrushSized && size <= 24) {
        const offsets = brushOffsets(size, p.brushShape);
        ctx.fillStyle =
          p.tool === 'eraser' ? 'rgba(255,255,255,0.22)' : argbToCss(p.activeColor);
        ctx.globalAlpha = p.tool === 'eraser' ? 1 : 0.45;
        for (const [dx, dy] of offsets) {
          const gx = hx + dx;
          const gy = hy + dy;
          if (!p.tiledMode && (gx < 0 || gy < 0 || gx >= w || gy >= h)) continue;
          ctx.fillRect(gx * zoom, gy * zoom, zoom, zoom);
        }
        ctx.globalAlpha = 1;
      }
      const rx = (hx + startOff) * zoom;
      const ry = (hy + startOff) * zoom;
      const rSize = size * zoom;
      if (isBrushSized && size > 1 && p.brushShape === 'round') {
        if (size > 24) {
          ctx.fillStyle =
            p.tool === 'eraser' ? 'rgba(255,255,255,0.22)' : argbToCss(p.activeColor);
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(rx + rSize / 2, ry + rSize / 2, rSize / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.arc(rx + rSize / 2, ry + rSize / 2, rSize / 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        if (size > 24 && isBrushSized) {
          ctx.fillStyle =
            p.tool === 'eraser' ? 'rgba(255,255,255,0.22)' : argbToCss(p.activeColor);
          ctx.globalAlpha = 0.35;
          ctx.fillRect(rx, ry, rSize, rSize);
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rSize, rSize);
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, rSize, rSize);
      }
      ctx.restore();
    }
  }

  if (p.ctrlHeld && p.hoverPt && !p.isPanning && !p.isDrawing) {
    const [hx, hy] = p.hoverPt;
    if (hx >= 0 && hy >= 0 && hx < w && hy < h) {
      const hIdx = hy * w + hx;
      let foundLayerIdx = -1;
      for (let i = project.layers.length - 1; i >= 0; i--) {
        const lay = project.layers[i];
        if (!lay.visible) continue;
        if (lay.groupId) {
          const grp = project.groups.find((g) => g.id === lay.groupId);
          if (grp && !grp.visible) continue;
        }
        if (((lay.pixels[hIdx] >>> 24) & 0xff) > 0) {
          foundLayerIdx = i;
          break;
        }
      }

      if (foundLayerIdx >= 0) {
        const lay = project.layers[foundLayerIdx];
        const cacheKey = `${p.activeFrameId}:${lay.id}:${p.revision}`;
        let cached = p.hoveredLayerCacheRef.current;
        if (!cached || cached.key !== cacheKey) {
          const edges: number[] = [];
          let minX = w;
          let minY = h;
          const px = lay.pixels;
          for (let py = 0; py < h; py++) {
            for (let pxx = 0; pxx < w; pxx++) {
              if (((px[py * w + pxx] >>> 24) & 0xff) === 0) continue;
              if (pxx < minX) minX = pxx;
              if (py < minY) minY = py;
              if (py === 0 || ((px[(py - 1) * w + pxx] >>> 24) & 0xff) === 0) {
                edges.push(pxx, py, pxx + 1, py);
              }
              if (py === h - 1 || ((px[(py + 1) * w + pxx] >>> 24) & 0xff) === 0) {
                edges.push(pxx, py + 1, pxx + 1, py + 1);
              }
              if (pxx === 0 || ((px[py * w + (pxx - 1)] >>> 24) & 0xff) === 0) {
                edges.push(pxx, py, pxx, py + 1);
              }
              if (pxx === w - 1 || ((px[py * w + (pxx + 1)] >>> 24) & 0xff) === 0) {
                edges.push(pxx + 1, py, pxx + 1, py + 1);
              }
            }
          }
          cached = { key: cacheKey, edges, minX, minY, name: lay.name };
          p.hoveredLayerCacheRef.current = cached;
        }

        if (cached.edges.length > 0) {
          ctx.save();
          ctx.strokeStyle = selectionBlue;
          ctx.lineWidth = 1.75;
          ctx.beginPath();
          const eArr = cached.edges;
          for (let i = 0; i < eArr.length; i += 4) {
            ctx.moveTo(eArr[i] * zoom, eArr[i + 1] * zoom);
            ctx.lineTo(eArr[i + 2] * zoom, eArr[i + 3] * zoom);
          }
          ctx.stroke();

          ctx.font = '600 11px system-ui, -apple-system, sans-serif';
          const labelW = ctx.measureText(cached.name).width + 10;
          const lx = cached.minX * zoom;
          const ly = cached.minY * zoom - 20;
          ctx.fillStyle = selectionBlue;
          ctx.beginPath();
          ctx.roundRect(lx, ly, labelW, 17, 4);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(cached.name, lx + 5, ly + 12);
          ctx.restore();
        }
      }
    }
  }

  ctx.restore();
  ctx.restore();
}
