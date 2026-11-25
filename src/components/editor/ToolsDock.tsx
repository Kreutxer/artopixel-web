import { useEffect, useRef, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  ChevronDown,
  Circle,
  Eraser,
  Move,
  PaintBucket,
  Pencil,
  Redo2,
  Spline,
  Square,
  SquareDashed,
  Undo2,
} from 'lucide-react';
import { PixelTool } from '../../engine/types';

function renderToolIcon(t: PixelTool, shapeFilled: boolean, pixelPerfect = false) {
  switch (t) {
    case 'pencil':
      return pixelPerfect ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 21.5l1.15-4.7 3.55 3.55-4.7 1.15z" />
          <path d="M9.1 18.45l9.35-9.35-3.55-3.55-9.35 9.35 3.55 3.55z" />
          <path d="M20.2 7.35l.8-.8a2.1 2.1 0 0 0-3-3l-.8.8 3 3z" />
        </svg>
      ) : (
        <Pencil size={18} />
      );
    case 'eraser':
      return <Eraser size={18} />;
    case 'fill':
      return <PaintBucket size={18} />;
    case 'line':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="5" y1="19" x2="19" y2="5" />
        </svg>
      );
    case 'rectangle':
      return <Square size={18} fill={shapeFilled ? 'currentColor' : 'none'} />;
    case 'circle':
      return <Circle size={18} fill={shapeFilled ? 'currentColor' : 'none'} />;
    case 'curve':
      return <Spline size={18} />;
    case 'marquee':
      return <SquareDashed size={18} />;
    case 'move':
      return <Move size={18} />;
    default:
      return <Pencil size={18} />;
  }
}

export function ToolsDock({
  tool,
  pixelPerfect,
  moveAllLayers,
  shapeFilled,
  bottomOffset,
  disableTransition,
  canUndo,
  canRedo,
  onSelectTool,
  onSetShapeFilled,
  onUndo,
  onRedo,
}: {
  tool: PixelTool;
  pixelPerfect: boolean;
  moveAllLayers: boolean;
  shapeFilled: boolean;
  bottomOffset: number;
  disableTransition: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (t: PixelTool) => void;
  onSetShapeFilled: (filled: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [lastShape, setLastShape] = useState<'rectangle' | 'circle'>('rectangle');
  const shapeMenuRef = useRef<HTMLDivElement | null>(null);

  useEscapeKey(() => setShapeMenuOpen(false), shapeMenuOpen);

  useEffect(() => {
    if (!shapeMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-shape-toggle="true"]')) return;
      if (shapeMenuRef.current && !shapeMenuRef.current.contains(target)) {
        setShapeMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [shapeMenuOpen]);

  const transition = disableTransition
    ? 'none'
    : 'bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <>
      <div
        className="ui-scaled"
        style={{
          position: 'absolute',
          left: 12,
          bottom: bottomOffset,
          width: 48,
          height: 48,
          transition,
        }}
      >
        <div
          className="floating-card dock-tools"
          aria-hidden={dockCollapsed}
          style={{
            position: 'absolute',
            left: 0,
            bottom: 56,
            width: 48,
            padding: '4px 0',
            borderWidth: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            maxHeight: 'calc(100vh - 150px)',
            scrollbarWidth: 'none',
            opacity: dockCollapsed ? 0 : 1,
            visibility: dockCollapsed ? 'hidden' : 'visible',
            transform: dockCollapsed ? 'translateY(6px)' : 'translateY(0)',
            overflowY: 'auto',
            pointerEvents: dockCollapsed ? 'none' : 'auto',
          }}
        >
          {(
            [
              ['pencil', 'Pencil (B)'],
              ['eraser', 'Eraser (E)'],
              ['fill', 'Fill (G)'],
              ['line', 'Line (L)'],
              ['curve', 'Curve (U)'],
              ['marquee', 'Marquee (M)'],
              ['move', 'Move (V)'],
            ] as Array<[PixelTool, string]>
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              className={`icon-btn ${tool === t ? 'active' : ''}`}
              aria-label={label}
              aria-pressed={tool === t}
              title={label}
              tabIndex={dockCollapsed ? -1 : 0}
              onClick={() => {
                setShapeMenuOpen(false);
                onSelectTool(t);
              }}
              style={{ width: 40, height: 38, flexShrink: 0 }}
            >
              {renderToolIcon(t, shapeFilled, pixelPerfect)}
            </button>
          ))}

          <button
            type="button"
            data-shape-toggle="true"
            className={`icon-btn ${tool === 'rectangle' || tool === 'circle' ? 'active' : ''}`}
            aria-label="Shapes (Square, Circle, Filled)"
            aria-expanded={shapeMenuOpen}
            aria-haspopup="menu"
            title="Shapes"
            tabIndex={dockCollapsed ? -1 : 0}
            onClick={() => setShapeMenuOpen((v) => !v)}
            style={{ width: 40, height: 38, flexShrink: 0, position: 'relative' }}
          >
            {(tool === 'circle' || (tool !== 'rectangle' && lastShape === 'circle')) ? (
              <Circle size={18} fill={shapeFilled ? 'currentColor' : 'none'} />
            ) : (
              <Square size={18} fill={shapeFilled ? 'currentColor' : 'none'} />
            )}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: 3,
                bottom: 3,
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderBottom: '4px solid currentColor',
                opacity: 0.7,
              }}
            />
          </button>
        </div>

        {shapeMenuOpen && !dockCollapsed && (
          <div
            ref={shapeMenuRef}
            role="menu"
            aria-label="Shape tools"
            className="floating-card menu-pop-up"
            style={{
              position: 'absolute',
              left: 56,
              bottom: 56,
              padding: 6,
              background: 'var(--surface)',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 4,
              zIndex: 45,
              transformOrigin: 'bottom left',
            }}
          >
            {(
              [
                ['rectangle', false, 'Square Outline (R)'],
                ['rectangle', true, 'Square Filled'],
                ['circle', false, 'Circle Outline (C)'],
                ['circle', true, 'Circle Filled'],
              ] as const
            ).map(([shapeTool, filled, label]) => {
              const isSelected = tool === shapeTool && shapeFilled === filled;
              return (
                <button
                  key={`${shapeTool}-${String(filled)}`}
                  type="button"
                  role="menuitem"
                  className={`icon-btn ${isSelected ? 'active' : ''}`}
                  aria-label={label}
                  title={label}
                  style={{ width: 38, height: 38 }}
                  onClick={() => {
                    setLastShape(shapeTool);
                    onSetShapeFilled(filled);
                    onSelectTool(shapeTool);
                    setShapeMenuOpen(false);
                  }}
                >
                  {shapeTool === 'rectangle' ? (
                    <Square size={18} fill={filled ? 'currentColor' : 'none'} />
                  ) : (
                    <Circle size={18} fill={filled ? 'currentColor' : 'none'} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="floating-card"
          aria-label={dockCollapsed ? 'Expand tools' : 'Collapse tools'}
          aria-expanded={!dockCollapsed}
          title={dockCollapsed ? 'Expand tools' : 'Collapse tools'}
          onClick={() => {
            setShapeMenuOpen(false);
            setDockCollapsed((v) => !v);
          }}
          style={{
            width: 48,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: dockCollapsed ? 'var(--accent)' : 'var(--text-secondary)',
            borderColor: dockCollapsed ? 'var(--accent)' : 'var(--border)',
          }}
        >
          {dockCollapsed ? renderToolIcon(tool, shapeFilled, pixelPerfect) : <ChevronDown size={20} />}
        </button>
      </div>

      <div
        className="floating-card ui-scaled"
        style={{
          position: 'absolute',
          left: 70,
          bottom: bottomOffset,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          transition,
        }}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={20} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 size={20} />
        </button>
      </div>
    </>
  );
}
