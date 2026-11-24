import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import {
  PRESET_PALETTES,
  argbToCss,
  argbToHex6,
  extractPaletteFromDataUrl,
} from '../engine/paletteQuantizer';
import {
  deleteCustomPalette,
  loadCustomPalettes,
  saveCustomPalette,
} from '../engine/storage';
import { SavedPalette } from '../engine/types';

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export function ColorModal({
  activeColor,
  palette,
  onSelectColor,
  onSetPalette,
  onClose,
}: {
  activeColor: number;
  palette: number[];
  onSelectColor: (argb: number) => void;
  onSetPalette: (colors: number[]) => void;
  onClose: () => void;
}) {
  const [h, setH] = useState(0);
  const [s, setS] = useState(0);
  const [v, setV] = useState(0);
  const [a, setA] = useState(1);
  const [hex, setHex] = useState(argbToHex6(activeColor));
  const [allPalettes, setAllPalettes] = useState<SavedPalette[]>(PRESET_PALETTES);
  const [selectedPalId, setSelectedPalId] = useState('');
  const [extractDataUrl, setExtractDataUrl] = useState<string | null>(null);
  const [extractColors, setExtractColors] = useState<number[]>([]);
  const [extractCount, setExtractCount] = useState(16);
  const [extractName, setExtractName] = useState('Custom Palette');

  const wheelRef = useRef<HTMLCanvasElement | null>(null);
  const wheelBaseRef = useRef<HTMLCanvasElement | null>(null);
  const wheelHueSatRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const r = (activeColor >>> 16) & 0xff;
    const g = (activeColor >>> 8) & 0xff;
    const b = activeColor & 0xff;
    const alpha = ((activeColor >>> 24) & 0xff) / 255;
    const [nh, ns, nv] = rgbToHsv(r, g, b);
    setH(nh);
    setS(ns);
    setV(nv);
    setA(alpha);
    setHex(argbToHex6(activeColor));
    loadCustomPalettes().then((custom) => {
      setAllPalettes([...custom, ...PRESET_PALETTES]);
    });
  }, [activeColor]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const currentArgb = (() => {
    const [r, g, b] = hsvToRgb(h, s, v);
    const alpha = Math.round(a * 255) & 0xff;
    return ((alpha << 24) | (r << 16) | (g << 8) | b) >>> 0;
  })();

  // Rebuild cached hue/sat + value wheel only when `v` changes
  useEffect(() => {
    const size = 168;
    const r = size / 2;

    if (!wheelHueSatRef.current) {
      const hs = document.createElement('canvas');
      hs.width = size;
      hs.height = size;
      const hctx = hs.getContext('2d');
      if (hctx) {
        for (let deg = 0; deg < 360; deg++) {
          hctx.beginPath();
          hctx.moveTo(r, r);
          hctx.arc(r, r, r, (deg * Math.PI) / 180, ((deg + 2) * Math.PI) / 180);
          hctx.closePath();
          hctx.fillStyle = `hsl(${deg}, 100%, 50%)`;
          hctx.fill();
        }
        const grad = hctx.createRadialGradient(r, r, 0, r, r, r);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        hctx.fillStyle = grad;
        hctx.beginPath();
        hctx.arc(r, r, r, 0, Math.PI * 2);
        hctx.fill();
      }
      wheelHueSatRef.current = hs;
    }

    if (!wheelBaseRef.current) {
      const base = document.createElement('canvas');
      base.width = size;
      base.height = size;
      wheelBaseRef.current = base;
    }

    const bctx = wheelBaseRef.current.getContext('2d');
    if (bctx && wheelHueSatRef.current) {
      bctx.clearRect(0, 0, size, size);
      bctx.drawImage(wheelHueSatRef.current, 0, 0);
      if (v < 1) {
        bctx.fillStyle = `rgba(0,0,0,${1 - v})`;
        bctx.beginPath();
        bctx.arc(r, r, r, 0, Math.PI * 2);
        bctx.fill();
      }
    }
  }, [v]);

  useEffect(() => {
    const canvas = wheelRef.current;
    if (!canvas || !wheelBaseRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 168;
    const r = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(wheelBaseRef.current, 0, 0);

    const rad = (h * Math.PI) / 180;
    const tx = r + Math.cos(rad) * s * r;
    const ty = r + Math.sin(rad) * s * r;
    ctx.beginPath();
    ctx.arc(tx, ty, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [h, s, v]);

  const updateFromWheelPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    const radius = rect.width / 2;
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const sat = Math.min(1, Math.hypot(dx, dy) / radius);
    setH(angle);
    setS(sat);
    const [r, g, b] = hsvToRgb(angle, sat, v);
    setHex(
      (((r << 16) | (g << 8) | b) >>> 0)
        .toString(16)
        .padStart(6, '0')
        .toUpperCase()
    );
  };

  const handleWheelPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromWheelPointer(e);
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) && e.buttons !== 1) return;
    updateFromWheelPointer(e);
  };

  const applyFromArgb = (argb: number) => {
    const r = (argb >>> 16) & 0xff;
    const g = (argb >>> 8) & 0xff;
    const b = argb & 0xff;
    const alpha = ((argb >>> 24) & 0xff) / 255;
    const [nh, ns, nv] = rgbToHsv(r, g, b);
    setH(nh);
    setS(ns);
    setV(nv);
    setA(alpha);
    setHex(argbToHex6(argb));
  };

  const runExtract = async (url: string, count: number) => {
    const cols = await extractPaletteFromDataUrl(url, count);
    setExtractColors(cols);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Color and Palette Picker"
        className="floating-card"
        style={{
          width: 'min(340px, calc(100vw - 24px))',
          padding: 18,
          background: 'var(--surface)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <div
            aria-hidden="true"
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: argbToCss(currentArgb),
            }}
          />
          <input
            aria-label="Hex color code"
            value={`#${hex}`}
            maxLength={7}
            className="mono"
            onChange={(e) => {
              const raw = e.target.value.replace('#', '').toUpperCase();
              setHex(raw);
              if (/^[0-9A-F]{6}$/.test(raw)) {
                const rgb = parseInt(raw, 16);
                const [nh, ns, nv] = rgbToHsv(
                  (rgb >>> 16) & 0xff,
                  (rgb >>> 8) & 0xff,
                  rgb & 0xff
                );
                setH(nh);
                setS(ns);
                setV(nv);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-elevated)',
              color: 'var(--text-primary)',
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <canvas
            ref={wheelRef}
            width={168}
            height={168}
            aria-label="Hue and saturation color wheel"
            onPointerDown={handleWheelPointerDown}
            onPointerMove={handleWheelPointerMove}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            style={{ borderRadius: '50%', cursor: 'crosshair', touchAction: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <label htmlFor="color-val-range" className="mono" style={{ width: 42, fontSize: 12 }}>
            Val
          </label>
          <input
            id="color-val-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={v}
            onChange={(e) => setV(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <label htmlFor="color-alpha-range" className="mono" style={{ width: 42, fontSize: 12 }}>
            Alpha
          </label>
          <input
            id="color-alpha-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={a}
            onChange={(e) => setA(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <select
            aria-label="Select palette"
            value={selectedPalId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedPalId(id);
              const found = allPalettes.find((p) => p.id === id);
              if (found) {
                onSetPalette(found.colors);
                if (found.colors[0] !== undefined) applyFromArgb(found.colors[0]);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-elevated)',
              color: 'var(--text-primary)',
              fontSize: 12,
            }}
          >
            <option value="">Switch Palette...</option>
            {allPalettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {selectedPalId && !PRESET_PALETTES.some((p) => p.id === selectedPalId) && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Delete custom palette"
              title="Delete custom palette"
              style={{ width: 32, height: 32, color: 'var(--danger)' }}
              onClick={async () => {
                await deleteCustomPalette(selectedPalId);
                const custom = await loadCustomPalettes();
                setAllPalettes([...custom, ...PRESET_PALETTES]);
                setSelectedPalId('');
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: '6px 10px' }}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus size={14} /> From Image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                const url = reader.result as string;
                setExtractDataUrl(url);
                await runExtract(url, extractCount);
              };
              reader.readAsDataURL(file);
            }}
          />
        </div>

        {extractDataUrl && (
          <div
            style={{
              padding: 10,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface-elevated)',
              marginBottom: 12,
            }}
          >
            <input
              aria-label="Custom palette name"
              value={extractName}
              onChange={(e) => setExtractName(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                marginBottom: 8,
              }}
            />
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {[4, 8, 16, 32].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={extractCount === n}
                  className={`btn ${extractCount === n ? 'primary' : ''}`}
                  style={{ padding: '4px 8px', fontSize: 11 }}
                  onClick={() => {
                    setExtractCount(n);
                    runExtract(extractDataUrl, n);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {extractColors.map((c, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Remove extracted color #${argbToHex6(c)}`}
                  onClick={() => {
                    if (extractColors.length > 1) {
                      setExtractColors(extractColors.filter((_, i) => i !== idx));
                    }
                  }}
                  title="Click to remove"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: argbToCss(c),
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="btn primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
              onClick={async () => {
                const pal: SavedPalette = {
                  id: `pal_${Date.now()}`,
                  name: extractName.trim() || 'Custom Palette',
                  colors: extractColors,
                };
                await saveCustomPalette(pal);
                const custom = await loadCustomPalettes();
                setAllPalettes([...custom, ...PRESET_PALETTES]);
                setSelectedPalId(pal.id);
                onSetPalette(pal.colors);
                setExtractDataUrl(null);
              }}
            >
              Save Palette
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {palette.map((c, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Select color #${argbToHex6(c)}`}
              aria-pressed={c === currentArgb}
              onClick={() => applyFromArgb(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: argbToCss(c),
                border:
                  c === currentArgb
                    ? '2px solid var(--accent)'
                    : '1px solid var(--border)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onSelectColor(currentArgb);
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
