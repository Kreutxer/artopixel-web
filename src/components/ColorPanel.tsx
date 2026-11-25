import { useCallback, useEffect, useRef, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Pipette,
  Plus,
  Trash2,
} from 'lucide-react';
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
import { buildArgb, hsvToRgb, rgbToHsv } from '../engine/colorUtils';
import { SavedPalette } from '../engine/types';

export function ColorPanel({
  activeColor,
  palette,
  isEyedropperActive = false,
  onToggleEyedropper,
  onSelectColor,
  onSetPalette,
}: {
  activeColor: number;
  palette: number[];
  isEyedropperActive?: boolean;
  onToggleEyedropper?: () => void;
  onSelectColor: (argb: number) => void;
  onSetPalette: (colors: number[]) => void;
}) {
  const [h, setH] = useState(0);
  const [s, setS] = useState(0);
  const [v, setV] = useState(0);
  const [a, setA] = useState(1);
  const [hex, setHex] = useState(argbToHex6(activeColor));
  const [expanded, setExpanded] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const [allPalettes, setAllPalettes] = useState<SavedPalette[]>(PRESET_PALETTES);
  const [selectedPalId, setSelectedPalId] = useState('');
  const [creatingPalette, setCreatingPalette] = useState(false);
  const [newPaletteName, setNewPaletteName] = useState('');
  const [extractDataUrl, setExtractDataUrl] = useState<string | null>(null);
  const [extractColors, setExtractColors] = useState<number[]>([]);
  const [extractCount, setExtractCount] = useState(16);
  const [extractName, setExtractName] = useState('Custom Palette');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const paletteStripRef = useRef<HTMLDivElement | null>(null);
  const scrollTargetRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const wheelRef = useRef<HTMLCanvasElement | null>(null);
  const wheelBaseRef = useRef<HTMLCanvasElement | null>(null);
  const wheelHueSatRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const updateScrollIndicators = useCallback(() => {
    const el = paletteStripRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    updateScrollIndicators();
    window.addEventListener('resize', updateScrollIndicators);
    return () => window.removeEventListener('resize', updateScrollIndicators);
  }, [palette, updateScrollIndicators]);

  const smoothScrollBy = (delta: number) => {
    const el = paletteStripRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const cur = scrollTargetRef.current ?? el.scrollLeft;
    scrollTargetRef.current = Math.max(0, Math.min(maxScroll, cur + delta));
    if (scrollRafRef.current === null) {
      const step = () => {
        const target = scrollTargetRef.current;
        const node = paletteStripRef.current;
        if (target === null || !node) {
          scrollRafRef.current = null;
          return;
        }
        const diff = target - node.scrollLeft;
        if (Math.abs(diff) < 0.5) {
          node.scrollLeft = target;
          scrollTargetRef.current = null;
          scrollRafRef.current = null;
          return;
        }
        node.scrollLeft += diff * 0.22;
        scrollRafRef.current = requestAnimationFrame(step);
      };
      scrollRafRef.current = requestAnimationFrame(step);
    }
  };

  useEffect(() => {
    loadCustomPalettes().then((custom) => {
      setAllPalettes([...custom, ...PRESET_PALETTES]);
    });
  }, []);

  useEscapeKey(() => setExpanded(false), expanded);

  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [expanded]);

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
  }, [activeColor]);

  useEffect(() => {
    if (!expanded) return;
    const size = 152;
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
  }, [v, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const canvas = wheelRef.current;
    if (!canvas || !wheelBaseRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 152;
    const r = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(wheelBaseRef.current, 0, 0);

    const rad = (h * Math.PI) / 180;
    const tx = r + Math.cos(rad) * s * r;
    const ty = r + Math.sin(rad) * s * r;
    ctx.beginPath();
    ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [h, s, v, expanded]);

  const updateFromWheelPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    const radius = rect.width / 2;
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const sat = Math.min(1, Math.hypot(dx, dy) / radius);
    setH(angle);
    setS(sat);
    const next = buildArgb(angle, sat, v, a);
    setHex(argbToHex6(next));
    onSelectColor(next);
  };

  const runExtract = async (url: string, count: number) => {
    const cols = await extractPaletteFromDataUrl(url, count);
    setExtractColors(cols);
  };

  const persistIfCustom = async (colors: number[]) => {
    if (!selectedPalId || PRESET_PALETTES.some((p) => p.id === selectedPalId)) return;
    const pal = allPalettes.find((p) => p.id === selectedPalId);
    if (!pal) return;
    const updated = { ...pal, colors };
    await saveCustomPalette(updated);
    setAllPalettes((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 6px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--surface-elevated)',
        minWidth: 0,
      }}
    >
      {/* Active color swatch + popover toggle */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={`Active color #${argbToHex6(activeColor)}. Click to open color picker`}
        aria-expanded={expanded}
        title={`Color Picker (#${argbToHex6(activeColor)})`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 30,
          padding: '2px 5px 2px 3px',
          borderRadius: 7,
          border: expanded ? '1px solid var(--accent)' : '1px solid var(--border)',
          background: 'var(--surface)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: argbToCss(activeColor),
            border: '1px solid var(--border)',
            display: 'block',
          }}
        />
        <ChevronDown size={12} style={{ color: 'var(--text-secondary)' }} />
      </button>

      {onToggleEyedropper && (
        <button
          type="button"
          className={`icon-btn ${isEyedropperActive ? 'active' : ''}`}
          style={{ width: 30, height: 30, flexShrink: 0 }}
          aria-label="Eyedropper tool (I)"
          aria-pressed={isEyedropperActive}
          title="Eyedropper (I)"
          onClick={onToggleEyedropper}
        >
          <Pipette size={14} />
        </button>
      )}

      {/* Inline palette swatches with hidden scrollbar + fixed arrow indicators */}
      <button
        type="button"
        disabled={!canScrollLeft}
        onClick={() => smoothScrollBy(-96)}
        aria-label="Scroll palette left"
        title="Scroll palette left"
        style={{
          width: 24,
          height: 26,
          borderRadius: 5,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: canScrollLeft ? 'pointer' : 'default',
          opacity: canScrollLeft ? 1 : 0.25,
          pointerEvents: canScrollLeft ? 'auto' : 'none',
          padding: 0,
          flexShrink: 0,
        }}
      >
        <ChevronLeft size={14} />
      </button>

      <div
        ref={paletteStripRef}
        role="group"
        aria-label="Color palette swatches"
        className="no-scrollbar"
        onScroll={updateScrollIndicators}
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth > el.clientWidth && e.deltaY !== 0) {
            e.preventDefault();
            smoothScrollBy(e.deltaY * 0.55);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          overflowX: 'auto',
          overflowY: 'hidden',
          maxWidth: 'min(26vw, 320px)',
          padding: '2px 0',
        }}
      >
        {palette.map((c, idx) => {
          const isActive = c === activeColor;
          return (
            <button
              key={`${c}-${idx}`}
              type="button"
              onClick={() => onSelectColor(c)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (palette.length > 1) {
                  const next = palette.filter((_, i) => i !== idx);
                  onSetPalette(next);
                  persistIfCustom(next);
                }
              }}
              title={`#${argbToHex6(c)} (Right-click to remove)`}
              aria-label={`Color #${argbToHex6(c)}`}
              aria-pressed={isActive}
              style={{
                width: 24,
                height: 24,
                borderRadius: 5,
                background: argbToCss(c),
                border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
                boxShadow: isActive ? '0 0 0 1px var(--surface)' : 'none',
              }}
            />
          );
        })}
        <button
          type="button"
          className="icon-btn"
          aria-label="Add active color to palette"
          title="Add active color to palette"
          onClick={() => {
            if (palette.includes(activeColor)) return;
            const next = [...palette, activeColor];
            onSetPalette(next);
            persistIfCustom(next);
          }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            border: '1px dashed var(--border)',
            padding: 0,
            flexShrink: 0,
          }}
        >
          <Plus size={12} />
        </button>
      </div>

      <button
        type="button"
        disabled={!canScrollRight}
        onClick={() => smoothScrollBy(96)}
        aria-label="Scroll palette right"
        title="More colors (scroll right)"
        style={{
          width: 24,
          height: 26,
          borderRadius: 5,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: canScrollRight ? 'pointer' : 'default',
          opacity: canScrollRight ? 1 : 0.25,
          pointerEvents: canScrollRight ? 'auto' : 'none',
          padding: 0,
          flexShrink: 0,
        }}
      >
        <ChevronRight size={14} />
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
          reader.onload = () => {
            const url = reader.result as string;
            setExtractDataUrl(url);
            setExtractName(file.name.replace(/\.[^.]+$/, ''));
            runExtract(url, extractCount);
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />

      {/* Dropdown Color Picker & Palette Manager Popover */}
      {expanded && (() => {
        const anchorRect = containerRef.current?.getBoundingClientRect();
        const popoverLeft = anchorRect
          ? Math.max(8, Math.min(anchorRect.left, window.innerWidth - 276))
          : 8;
        const popoverTop = anchorRect
          ? Math.max(8, Math.min(anchorRect.bottom + 6, window.innerHeight - 280))
          : 54;
        return (
        <div
          className="floating-card menu-pop"
          style={{
            position: 'fixed',
            top: popoverTop,
            left: popoverLeft,
            width: 'min(268px, calc(100vw - 16px))',
            maxHeight: 'calc(100vh - 64px)',
            overflowY: 'auto',
            padding: 12,
            background: 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            zIndex: 60,
          }}
        >
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              aria-label="Select palette"
              value={selectedPalId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedPalId(id);
                const found = allPalettes.find((p) => p.id === id);
                if (found) {
                  onSetPalette(found.colors);
                  if (found.colors[0] !== undefined) onSelectColor(found.colors[0]);
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '5px 6px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-elevated)',
                color: 'var(--text-primary)',
                fontSize: 11.5,
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
                style={{ width: 28, height: 28, color: 'var(--danger)' }}
                onClick={async () => {
                  await deleteCustomPalette(selectedPalId);
                  const custom = await loadCustomPalettes();
                  setAllPalettes([...custom, ...PRESET_PALETTES]);
                  setSelectedPalId('');
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              type="button"
              className={`icon-btn ${creatingPalette ? 'active' : ''}`}
              style={{ width: 28, height: 28 }}
              aria-label="Create new custom palette"
              title="New Custom Palette"
              onClick={() => {
                setNewPaletteName('');
                setCreatingPalette((v) => !v);
              }}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 28, height: 28 }}
              aria-label="Extract palette from image"
              title="Extract Palette from Image"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={14} />
            </button>
          </div>

          {creatingPalette && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const pal: SavedPalette = {
                  id: `pal_${Date.now()}`,
                  name: newPaletteName.trim() || 'Custom Palette',
                  colors: [activeColor],
                };
                await saveCustomPalette(pal);
                const custom = await loadCustomPalettes();
                setAllPalettes([...custom, ...PRESET_PALETTES]);
                setSelectedPalId(pal.id);
                onSetPalette(pal.colors);
                setCreatingPalette(false);
              }}
              style={{ display: 'flex', gap: 4, alignItems: 'center' }}
            >
              <input
                autoFocus
                aria-label="New palette name"
                placeholder="Palette name..."
                value={newPaletteName}
                onChange={(e) => setNewPaletteName(e.target.value)}
                className="field-input"
                style={{ flex: 1, minWidth: 0, padding: '4px 7px', fontSize: 11.5 }}
              />
              <button
                type="submit"
                className="btn primary"
                style={{ padding: '4px 9px', fontSize: 11.5 }}
              >
                Create
              </button>
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 7px', fontSize: 11.5 }}
                onClick={() => setCreatingPalette(false)}
              >
                Cancel
              </button>
            </form>
          )}

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
                onSelectColor(buildArgb(nh, ns, nv, a));
              }
            }}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-elevated)',
              color: 'var(--text-primary)',
              fontSize: 13,
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <canvas
              ref={wheelRef}
              width={152}
              height={152}
              aria-label="Hue and saturation color wheel"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                updateFromWheelPointer(e);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId) && e.buttons !== 1) return;
                updateFromWheelPointer(e);
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              style={{ borderRadius: '50%', cursor: 'crosshair', touchAction: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <input
              id="panel-val-range"
              type="range"
              aria-label="Value"
              title="Value"
              className="color-slider"
              min={0}
              max={1}
              step={0.01}
              value={v}
              onChange={(e) => {
                const nv = parseFloat(e.target.value);
                setV(nv);
                onSelectColor(buildArgb(h, s, nv, a));
              }}
              style={{
                width: '100%',
                background: (() => {
                  const [fr, fg, fb] = hsvToRgb(h, s, 1);
                  return `linear-gradient(to right, #000000, rgb(${fr}, ${fg}, ${fb}))`;
                })(),
              }}
            />
            <input
              id="panel-alpha-range"
              type="range"
              aria-label="Alpha"
              title="Alpha"
              className="color-slider"
              min={0}
              max={1}
              step={0.01}
              value={a}
              onChange={(e) => {
                const na = parseFloat(e.target.value);
                setA(na);
                onSelectColor(buildArgb(h, s, v, na));
              }}
              style={{
                width: '100%',
                backgroundImage: (() => {
                  const [cr, cg, cb] = hsvToRgb(h, s, v);
                  return `linear-gradient(to right, rgba(${cr}, ${cg}, ${cb}, 0), rgb(${cr}, ${cg}, ${cb})), repeating-conic-gradient(var(--checker-light) 0% 25%, var(--checker-dark) 0% 50%)`;
                })(),
                backgroundSize: '100% 100%, 8px 8px',
              }}
            />
          </div>

          {extractDataUrl && (
            <div
              style={{
                padding: 8,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-elevated)',
              }}
            >
              <input
                aria-label="Custom palette name"
                value={extractName}
                onChange={(e) => setExtractName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  marginBottom: 6,
                }}
              />
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {[4, 8, 16, 32].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={extractCount === n}
                    className={`btn ${extractCount === n ? 'primary' : ''}`}
                    style={{ padding: '3px 7px', fontSize: 11 }}
                    onClick={() => {
                      setExtractCount(n);
                      runExtract(extractDataUrl, n);
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
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
                      borderRadius: 5,
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
                style={{ width: '100%', justifyContent: 'center', fontSize: 11.5 }}
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
        </div>
        );
      })()}
    </div>
  );
}
