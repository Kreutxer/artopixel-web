import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Layers,
  Pause,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { PixelFrame, PixelProject } from '../engine/types';
import { renderFrameToCanvas } from '../engine/storage';

interface TimelinePanelProps {
  project: PixelProject;
  activeFrameIndex: number;
  fps: number;
  isPlaying: boolean;
  onionSkin: boolean;
  revision: number;
  layersOpen: boolean;
  layersWidth?: number;
  layersResizing?: boolean;
  open: boolean;
  panelHeight: number;
  isResizing: boolean;
  onToggleOpen: () => void;
  onPanelHeightChange: (height: number) => void;
  onResizingChange: (resizing: boolean) => void;
  onSelectFrame: (index: number) => void;
  onReorderFrame: (fromIndex: number, toIndex: number) => void;
  onAddFrame: () => void;
  onDuplicateFrame: () => void;
  onDeleteFrame: () => void;
  onTogglePlay: () => void;
  onSetFps: (fps: number) => void;
  onToggleOnionSkin: () => void;
}

const FrameThumb: React.FC<{
  projectWidth: number;
  projectHeight: number;
  frame: PixelFrame;
  revision: number;
  isActive: boolean;
  size: number;
}> = ({ projectWidth, projectHeight, frame, revision, isActive, size }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== projectWidth || canvas.height !== projectHeight) {
      canvas.width = projectWidth;
      canvas.height = projectHeight;
    }
    renderFrameToCanvas(projectWidth, projectHeight, frame, canvas);
  }, [projectWidth, projectHeight, frame, revision, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={projectWidth}
      height={projectHeight}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        imageRendering: 'pixelated',
        display: 'block',
        backgroundColor: 'var(--checker-light)',
        backgroundImage:
          'linear-gradient(45deg, var(--checker-dark) 25%, transparent 25%), linear-gradient(-45deg, var(--checker-dark) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--checker-dark) 75%), linear-gradient(-45deg, transparent 75%, var(--checker-dark) 75%)',
        backgroundSize: '8px 8px',
        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
        borderRadius: 4,
      }}
    />
  );
};

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  project,
  activeFrameIndex,
  fps,
  isPlaying,
  onionSkin,
  revision,
  layersOpen,
  layersWidth = 244,
  layersResizing = false,
  open,
  panelHeight,
  isResizing,
  onToggleOpen,
  onPanelHeightChange,
  onResizingChange,
  onSelectFrame,
  onReorderFrame,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onTogglePlay,
  onSetFps,
  onToggleOnionSkin,
}) => {
  const frames = project.frames ?? [
    {
      id: 'frame-0',
      layers: project.layers,
      groups: project.groups,
      activeLayerIndex: project.activeLayerIndex,
    },
  ];

  const frameRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const frameSnapRef = useRef<Array<{ idx: number; midX: number }>>([]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollTargetRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const smoothScrollBy = (delta: number) => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const cur = scrollTargetRef.current ?? el.scrollLeft;
    scrollTargetRef.current = Math.max(0, Math.min(maxScroll, cur + delta));
    if (scrollRafRef.current === null) {
      const step = () => {
        const target = scrollTargetRef.current;
        const node = trackRef.current;
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
  const [dragReorder, setDragReorder] = useState<{
    fromIndex: number;
    toIndex: number;
    startX: number;
    curX: number;
    active: boolean;
  } | null>(null);

  const canDelete = frames.length > 1;
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const rightOffset = layersOpen && !isNarrow ? `min(${layersWidth}px, 74vw)` : '14px';
  const thumbSize = Math.max(34, Math.min(168, panelHeight - 84));

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!open) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = panelHeight;
    onResizingChange(true);

    const onMove = (ev: PointerEvent) => {
      const delta = startY - ev.clientY;
      const maxH = Math.max(160, Math.min(320, Math.floor(window.innerHeight * 0.45)));
      onPanelHeightChange(Math.max(112, Math.min(maxH, startH + delta)));
    };

    const onUp = () => {
      onResizingChange(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      role="region"
      aria-label="Animation Timeline"
      className="ui-scaled"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: rightOffset,
        zIndex: 26,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
        transition: layersResizing
          ? 'none'
          : 'right 200ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Centered collapser tab (just like LayersPanel) */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={open ? 'Collapse timeline' : 'Expand timeline'}
        aria-expanded={open}
        title={open ? 'Collapse timeline' : 'Expand timeline'}
        style={{
          pointerEvents: 'auto',
          width: 64,
          height: 24,
          borderRadius: '10px 10px 0 0',
          border: '1.5px solid var(--text-muted)',
          borderBottom: 'none',
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.14)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>

      {/* Thin full-width collapsed strip below the tab so users can see the panel edge */}
      <div
        aria-hidden="true"
        style={{
          pointerEvents: open ? 'none' : 'auto',
          width: '100%',
          height: open ? 0 : 14,
          opacity: open ? 0 : 1,
          background: 'var(--surface)',
          borderTop: open ? 'none' : '1px solid var(--border)',
          transition: 'height 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease',
        }}
      />

      {/* Collapsible & resizable timeline drawer */}
      <div
        aria-hidden={!open}
        inert={!open}
        style={{
          pointerEvents: open ? 'auto' : 'none',
          width: '100%',
          height: panelHeight,
          maxHeight: open ? panelHeight : 0,
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.98)',
          transformOrigin: 'bottom center',
          overflow: 'hidden',
          background: 'var(--surface)',
          borderTop: open ? '1px solid var(--border)' : '0px solid transparent',
          color: 'var(--text-primary)',
          display: 'flex',
          flexDirection: 'column',
          transition: isResizing
            ? 'none'
            : 'max-height 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Top resize handle */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize timeline height"
          onPointerDown={handleResizePointerDown}
          title="Drag to resize timeline"
          style={{
            height: 6,
            width: '100%',
            cursor: 'ns-resize',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 2,
              borderRadius: 999,
              background: 'var(--border)',
            }}
          />
        </div>

        {/* Timeline toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '2px 12px 8px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          {/* Left: Playback & Onion Skin */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              disabled={frames.length <= 1}
              onClick={() => onSelectFrame((activeFrameIndex - 1 + frames.length) % frames.length)}
              aria-label="Previous frame"
              title="Previous frame"
            >
              <ChevronLeft size={15} />
            </button>

            <button
              type="button"
              className={`btn ${isPlaying ? 'primary' : ''}`}
              style={{ height: 30, padding: '0 10px', fontSize: 12 }}
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
              aria-pressed={isPlaying}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              type="button"
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              disabled={frames.length <= 1}
              onClick={() => onSelectFrame((activeFrameIndex + 1) % frames.length)}
              aria-label="Next frame"
              title="Next frame"
            >
              <ChevronRight size={15} />
            </button>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 30,
                padding: '0 8px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                fontSize: 11.5,
                color: 'var(--text-secondary)',
              }}
            >
              <span>FPS</span>
              <input
                type="number"
                min={1}
                max={30}
                value={fps}
                aria-label="Frames per second"
                className="mono"
                onChange={(e) => {
                  const v = Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 1)));
                  onSetFps(v);
                }}
                style={{
                  width: 36,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              />
            </label>

            <button
              type="button"
              className={`btn ${onionSkin ? 'primary' : ''}`}
              style={{ height: 30, padding: '0 10px', fontSize: 12 }}
              onClick={onToggleOnionSkin}
              aria-label="Toggle onion skin"
              aria-pressed={onionSkin}
              title="Onion Skin (Prev = coral, Next = blue)"
            >
              <Layers size={13} />
              <span>Onion Skin</span>
            </button>

            {frames.length > 1 && (
              <span
                className="mono"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 30,
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  paddingLeft: 4,
                }}
              >
                {activeFrameIndex + 1}/{frames.length}
              </span>
            )}
          </div>

          {/* Right: Frame CRUD */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="btn"
              style={{ height: 30, padding: '0 9px', fontSize: 12 }}
              onClick={onDuplicateFrame}
              aria-label="Duplicate active frame"
              title="Duplicate Frame"
            >
              <Copy size={13} />
              <span>Duplicate</span>
            </button>

            <button
              type="button"
              className="icon-btn"
              style={{
                width: 30,
                height: 30,
                opacity: canDelete ? 1 : 0.4,
                cursor: canDelete ? 'pointer' : 'not-allowed',
              }}
              onClick={onDeleteFrame}
              disabled={!canDelete}
              aria-label="Delete active frame"
              title={canDelete ? 'Delete Frame' : 'Cannot delete the only frame'}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Timeline Track */}
        <div
          ref={trackRef}
          onWheel={(e) => {
            const el = e.currentTarget;
            if (el.scrollWidth > el.clientWidth && e.deltaY !== 0) {
              e.preventDefault();
              smoothScrollBy(e.deltaY * 0.55);
            }
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '0 8px',
            gap: 0,
            background: 'var(--surface-elevated)',
          }}
        >
          {frames.map((frame, idx) => {
            const isActive = idx === activeFrameIndex;
            const isPrevOnion = onionSkin && !isPlaying && idx === activeFrameIndex - 1;
            const isNextOnion = onionSkin && !isPlaying && idx === activeFrameIndex + 1;
            const isDraggingThis = dragReorder?.active && dragReorder.fromIndex === idx;
            const isDropTarget =
              dragReorder?.active &&
              dragReorder.toIndex === idx &&
              dragReorder.fromIndex !== idx;

            return (
              <div
                key={frame.id}
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 6px',
                  flexShrink: 0,
                  background:
                    idx % 2 === 0
                      ? 'var(--surface-elevated)'
                      : 'color-mix(in srgb, var(--text-muted) 11%, var(--surface-elevated))',
                }}
              >
              <button
                ref={(el) => {
                  if (el) frameRefs.current.set(idx, el);
                  else frameRefs.current.delete(idx);
                }}
                type="button"
                onPointerDown={(e) => {
                  if (e.button !== 0 || frames.length <= 1) return;
                  const startX = e.clientX;
                  const snaps: Array<{ idx: number; midX: number }> = [];
                  frameRefs.current.forEach((el, fIdx) => {
                    const r = el.getBoundingClientRect();
                    snaps.push({ idx: fIdx, midX: r.left + r.width / 2 });
                  });
                  snaps.sort((a, b) => a.midX - b.midX);
                  frameSnapRef.current = snaps;

                  let curDrag = {
                    fromIndex: idx,
                    toIndex: idx,
                    startX,
                    curX: startX,
                    active: false,
                  };

                  const onMove = (ev: PointerEvent) => {
                    const dx = ev.clientX - startX;
                    if (!curDrag.active && Math.abs(dx) < 6) return;
                    let bestTo = idx;
                    let bestDist = Infinity;
                    for (const s of frameSnapRef.current) {
                      const d = Math.abs(ev.clientX - s.midX);
                      if (d < bestDist) {
                        bestDist = d;
                        bestTo = s.idx;
                      }
                    }
                    curDrag = {
                      ...curDrag,
                      active: true,
                      curX: ev.clientX,
                      toIndex: bestTo,
                    };
                    setDragReorder(curDrag);
                  };

                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                    setDragReorder(null);
                    if (curDrag.active && curDrag.fromIndex !== curDrag.toIndex) {
                      onReorderFrame(curDrag.fromIndex, curDrag.toIndex);
                    }
                  };

                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                }}
                onClick={() => {
                  if (!dragReorder?.active) onSelectFrame(idx);
                }}
                aria-label={`Select frame ${idx + 1} (drag to reorder)`}
                aria-current={isActive ? 'true' : undefined}
                title={`Frame ${idx + 1} (drag to reorder)`}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  overflow: 'hidden',
                  borderRadius: 8,
                  border: isDropTarget
                    ? '2px dashed var(--accent)'
                    : isActive
                      ? '2px solid var(--accent)'
                      : '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  cursor: isDraggingThis ? 'grabbing' : 'pointer',
                  flexShrink: 0,
                  zIndex: isDraggingThis ? 5 : 1,
                  opacity: isDraggingThis ? 0.85 : 1,
                  transform: isDraggingThis
                    ? `translateX(${dragReorder.curX - dragReorder.startX}px) scale(1.03)`
                    : 'none',
                  touchAction: 'none',
                }}
              >
                <FrameThumb
                  projectWidth={project.width}
                  projectHeight={project.height}
                  frame={frame}
                  revision={revision}
                  isActive={isActive}
                  size={thumbSize}
                />

                {/* Overlaid frame number badge */}
                <span
                  className="mono"
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    fontSize: 10,
                    lineHeight: 1,
                    fontWeight: isActive ? 700 : 600,
                    padding: '2px 5px',
                    borderRadius: 4,
                    background: isActive
                      ? 'var(--accent)'
                      : 'color-mix(in srgb, var(--surface) 88%, transparent)',
                    color: isActive ? 'var(--on-accent)' : 'var(--text-primary)',
                    pointerEvents: 'none',
                  }}
                >
                  {idx + 1}
                </span>

                {(isPrevOnion || isNextOnion) && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 5,
                      right: 5,
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: isPrevOnion ? 'var(--onion-prev)' : 'var(--onion-next)',
                      boxShadow: '0 0 0 1.5px var(--surface)',
                      pointerEvents: 'none',
                    }}
                    title={isPrevOnion ? 'Previous onion skin' : 'Next onion skin'}
                  />
                )}
              </button>
              </div>
            );
          })}

          {/* Quick append frame slot on the track */}
          <button
            type="button"
            onClick={onAddFrame}
            aria-label="Add frame at end"
            title="Add Frame"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: Math.max(44, Math.round(thumbSize * 0.75)),
              height: thumbSize + 4,
              marginLeft: 6,
              borderRadius: 8,
              border: '1px dashed var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
