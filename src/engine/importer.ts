import { parseApxlBuffer } from './apxlFormat';
import { parseAsepriteBuffer } from './asepriteParser';
import { createNewProject, ensureProjectFrames } from './pixelEngine';
import { PixelProject } from './types';

export async function importProjectFromFile(file: File): Promise<PixelProject> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.apxl')) {
    const buf = await file.arrayBuffer();
    const baseName = file.name.replace(/\.apxl$/i, '') || 'ArtoPixel Sprite';
    const project = await parseApxlBuffer(buf, baseName);
    return ensureProjectFrames(project);
  }
  if (lower.endsWith('.ase') || lower.endsWith('.aseprite')) {
    const buf = await file.arrayBuffer();
    const baseName = file.name.replace(/\.(ase|aseprite)$/i, '') || 'Aseprite Sprite';
    const { project } = await parseAsepriteBuffer(buf, baseName);
    return ensureProjectFrames(project);
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image (PNG/JPG/WebP), .apxl, .ase, or .aseprite file.');
  }

  return new Promise<PixelProject>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w < 4 || h < 4 || w > 1024 || h > 1024) {
        reject(new Error(`Image must be between 4×4 and 1024×1024 pixels (got ${w}×${h}).`));
        return;
      }
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not initialize canvas context.'));
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const baseName = file.name.replace(/\.[^.]+$/, '') || `Sprite ${w}x${h}`;
      const proj = ensureProjectFrames(createNewProject(baseName, w, h));
      const px = proj.layers[0].pixels;
      for (let i = 0; i < w * h; i++) {
        const off4 = i * 4;
        const r = data[off4];
        const g = data[off4 + 1];
        const b = data[off4 + 2];
        const a = data[off4 + 3];
        px[i] = a === 0 ? 0 : (((a << 24) | (r << 16) | (g << 8) | b) >>> 0);
      }
      resolve(proj);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode the selected image file.'));
    };
    img.src = url;
  });
}
