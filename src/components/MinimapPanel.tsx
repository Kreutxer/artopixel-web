import { useEffect, useRef, useState } from 'react';
import {
  Contrast,
  Eye,
  EyeOff,
  GripHorizontal,
  Lock,
  Unlock,
} from 'lucide-react';

const STORAGE_KEY = 'artopixel_minimap_v1';

function loadSavedState(): {
  x: number;
  y: number;
  size: number;
  locked: boolean;
  visible: boolean;
  dimmed: boolean;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return {
          x: parsed.x,
          y: parsed.y,
          size:
            typeof parsed.size === 'number'
              ? Math.max(64, Math.min(240, parsed.size))
              : 84,
          locked: Boolean(parsed.locked),
          visible: parsed.visible !== false,
          dimmed: Boolean(parsed.dimmed),
        };
      }
    }
  } catch {
    // ignore
  }
  return {
    x: typeof window !== 'undefined' ? Math.max(12, window.innerWidth - 118) : 520,
    y: 12,
    size: 84,
    locked: true,
    visible: true,
    dimmed: false,
  };
}

export function MinimapPanel({
  minimapRef,
  visible,
  leftInset = 12,
  rightInset = 12,
  topInset = 12,
  bottomInset = 12,
  onToggleVisible,
  onResize,
}: {
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  visible: boolean;
  leftInset?: number;
  rightInset?: number;
  topInset?: number;
  bottomInset?: number;
  onToggleVisible: () => void;
  onResize?: () => void;
}) {
  const initial = useRef(loadSavedState());
  const [locked, setLocked] = useState(initial.current.locked);
  const [dimmed, setDimmed] = useState(initial.current.dimmed);
  const [pos, setPos] = useState({ x: initial.current.x, y: initial.current.y });
  const [size, setSize] = useState(initial.current.size);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [parentSize, setParentSize] = useState<{ w: number; h: number } | null>(null);
  const [panelSize, setPanelSize] = useState<{ w: number; h: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeStartRef = useRef<{ startX: number; startY: number; startSize: number } | null>(
    null
  );

  useEffect(() => {
    const el = panelRef.current;
    const parent = el?.parentElement;
    if (!parent) return;
    const sync = () => {
      setParentSize({ w: parent.clientWidth, h: parent.clientHeight });
      if (el) {
        setPanelSize({ w: el.offsetWidth, h: el.offsetHeight });
      }
    };
    sync();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(sync);
      ro.observe(parent);
      if (el) ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ x: pos.x, y: pos.y, size, locked, visible, dimmed })
      );
    } catch {
      // ignore
    }
  }, [pos, size, locked, visible, dimmed]);

  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => onResize?.());
    return () => cancelAnimationFrame(raf);
  }, [size, visible, onResize]);

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragOffsetRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOffsetRef.current) return;
    const parent = panelRef.current?.parentElement?.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    const maxW = parent ? parent.width - (panelRect?.width ?? 96) - rightInset : window.innerWidth - 96;
    const maxH = parent ? parent.height - (panelRect?.height ?? 96) - bottomInset : window.innerHeight - 96;
    setPos({
      x: Math.max(leftInset, Math.min(maxW, e.clientX - dragOffsetRef.current.dx)),
      y: Math.max(topInset, Math.min(maxH, e.clientY - dragOffsetRef.current.dy)),
    });
  };

  const handleDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragOffsetRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
    dragOffsetRef.current = null;
  };

  const panelW = panelSize?.w ?? Math.max(146, size + 14);
  const panelH = panelSize?.h ?? (visible ? size + 50 : 42);
  const parentW =
    parentSize?.w ??
    panelRef.current?.parentElement?.clientWidth ??
    (typeof window !== 'undefined' ? window.innerWidth : 800);
  const parentH =
    parentSize?.h ??
    panelRef.current?.parentElement?.clientHeight ??
    (typeof window !== 'undefined' ? window.innerHeight - 54 : 600);
  const maxLeft = Math.max(leftInset, parentW - panelW - rightInset);
  const maxTop = Math.max(topInset, parentH - panelH - bottomInset);

  const effectiveLeft = isDragging ? pos.x : Math.min(Math.max(pos.x, leftInset), maxLeft);
  const effectiveTop = isDragging ? pos.y : Math.min(Math.max(pos.y, topInset), maxTop);

  return (
    <div
      ref={panelRef}
      className={`floating-card ${isDragging || isResizing ? '' : 'floating-panel-shift'}`}
      style={{
        position: 'absolute',
        left: effectiveLeft,
        top: effectiveTop,
        width: panelW,
        padding: 6,
        borderRadius: 12,
        zIndex: 25,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        opacity: dimmed ? 0.5 : 1,
        transition: 'opacity 180ms ease',
      }}
    >
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          cursor: locked ? 'default' : 'grab',
          touchAction: 'none',
        }}
      >
        {!locked && (
          <GripHorizontal size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            marginRight: 'auto',
            paddingLeft: 2,
          }}
        >
          Preview
        </span>
        <button
          type="button"
          className={`icon-btn ${dimmed ? 'active' : ''}`}
          style={{ width: 28, height: 28 }}
          aria-label={dimmed ? 'Restore minimap opacity to 100%' : 'Set minimap opacity to 50%'}
          aria-pressed={dimmed}
          title={dimmed ? 'Opacity: 50% (click for 100%)' : 'Opacity: 100% (click for 50%)'}
          onClick={() => setDimmed((v) => !v)}
        >
          <Contrast size={13} />
        </button>
        <button
          type="button"
          className="icon-btn"
          style={{ width: 28, height: 28 }}
          aria-label={visible ? 'Hide minimap' : 'Show minimap'}
          aria-pressed={visible}
          title={visible ? 'Hide Minimap' : 'Show Minimap'}
          onClick={onToggleVisible}
        >
          {visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          type="button"
          className={`icon-btn ${locked ? 'active' : ''}`}
          style={{ width: 28, height: 28 }}
          aria-label={locked ? 'Unlock minimap to move' : 'Lock minimap in place'}
          aria-pressed={locked}
          title={locked ? 'Locked in place (click to unlock)' : 'Unlocked (click to lock)'}
          onClick={() => setLocked((v) => !v)}
        >
          {locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
      </div>

      <div
        className="dock-tools"
        aria-hidden={!visible}
        style={{
          maxHeight: visible ? size + 16 : 0,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.97)',
          transformOrigin: 'top center',
          overflow: 'hidden',
          pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: size,
            height: size,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--checker-dark)',
            padding: 3,
          }}
        >
          <canvas
            ref={minimapRef}
            width={Math.max(64, size)}
            height={Math.max(64, size)}
            style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
          />
          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize minimap (drag or use arrow keys)"
            title="Drag or use arrow keys to resize minimap"
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                setSize((s) => Math.min(240, s + 8));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                setSize((s) => Math.max(64, s - 8));
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsResizing(true);
              resizeStartRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startSize: size,
              };
            }}
            onPointerMove={(e) => {
              if (!resizeStartRef.current) return;
              const delta = Math.max(
                e.clientX - resizeStartRef.current.startX,
                e.clientY - resizeStartRef.current.startY
              );
              setSize(Math.max(64, Math.min(240, Math.round(resizeStartRef.current.startSize + delta))));
            }}
            onPointerUp={(e) => {
              if (resizeStartRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              setIsResizing(false);
              resizeStartRef.current = null;
            }}
            onPointerCancel={() => {
              setIsResizing(false);
              resizeStartRef.current = null;
            }}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 24,
              height: 24,
              cursor: 'nwse-resize',
              touchAction: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M9 1L1 9M9 5L5 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
