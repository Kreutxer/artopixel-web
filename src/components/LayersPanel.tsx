import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Contrast,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  GripVertical,
  Lock,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { PixelLayer, PixelProject } from '../engine/types';
import { DeleteGroupModal } from './layers/DeleteGroupModal';
import { DeleteLayersModal } from './layers/DeleteLayersModal';
import { useEscapeKey } from '../hooks/useEscapeKey';

function LayerThumb({
  layer,
  width,
  height,
  revision,
}: {
  layer: PixelLayer;
  width: number;
  height: number;
  revision: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(width, height);
    const out = img.data;
    const px = layer.pixels;
    for (let i = 0; i < width * height; i++) {
      const argb = px[i];
      const a = (argb >>> 24) & 0xff;
      if (a === 0) continue;
      const off = i * 4;
      out[off] = (argb >>> 16) & 0xff;
      out[off + 1] = (argb >>> 8) & 0xff;
      out[off + 2] = argb & 0xff;
      out[off + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
  }, [layer, layer.pixels, width, height, revision]);

  return (
    <div
      aria-hidden="true"
      className="project-card-checker"
      style={{
        width: 26,
        height: 26,
        borderRadius: 5,
        border: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={ref}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}

export function LayersPanel({
  project,
  revision = 0,
  open,
  width = 276,
  isResizing = false,
  dimOtherLayers = false,
  onToggleDimOthers,
  onWidthChange,
  onResizingChange,
  onToggleOpen,
  onSelectLayer,
  onAddLayer,
  onToggleVisibility,
  onToggleAlphaLock,
  onSetOpacity,
  onReorderLayer,
  onRenameLayer,
  onDuplicateLayers,
  onCopyLayersToFrame,
  onMergeLayers,
  onGroupLayers,
  onUngroupLayers,
  onDeleteLayers,
  onToggleGroupCollapse,
  onToggleGroupVisibility,
  onDeleteGroup,
  onSelectedIdsChange,
}: {
  project: PixelProject;
  revision?: number;
  open: boolean;
  width?: number;
  isResizing?: boolean;
  dimOtherLayers?: boolean;
  onToggleDimOthers?: () => void;
  onWidthChange?: (w: number) => void;
  onResizingChange?: (resizing: boolean) => void;
  onToggleOpen: () => void;
  onSelectLayer: (idx: number) => void;
  onAddLayer: () => void;
  onToggleVisibility: (idx: number) => void;
  onToggleAlphaLock: (idx: number) => void;
  onSetOpacity: (idx: number, opacity: number) => void;
  onReorderLayer: (oldIdx: number, newIdx: number) => void;
  onRenameLayer: (idx: number, name: string) => void;
  onDuplicateLayers: (indices: number[]) => void;
  onCopyLayersToFrame?: (indices: number[], targetFrameIndex: number | 'all') => void;
  onMergeLayers: (indices: number[]) => void;
  onGroupLayers: (indices: number[], name: string) => void;
  onUngroupLayers: (indices: number[]) => void;
  onDeleteLayers: (indices: number[]) => void;
  onToggleGroupCollapse: (groupId: string) => void;
  onToggleGroupVisibility: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSelectedIdsChange?: (ids: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    onSelectedIdsChange?.(selectedIds);
  }, [selectedIds, onSelectedIdsChange]);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    targets: number[];
  } | null>(null);
  const [copyFrameSubOpen, setCopyFrameSubOpen] = useState(false);
  useEscapeKey(() => {
    setCopyFrameSubOpen(false);
    setCtxMenu(null);
  }, Boolean(ctxMenu));
  const [promptState, setPromptState] = useState<
    | { kind: 'group'; value: string; targets: number[] }
    | { kind: 'rename'; value: string; index: number }
    | null
  >(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{
    id: string;
    name: string;
    layerIndices: number[];
  } | null>(null);
  const [deleteLayersConfirm, setDeleteLayersConfirm] = useState<number[] | null>(null);
  const [inlineRename, setInlineRename] = useState<{ index: number; value: string } | null>(null);

  const ctxMenuRef = useRef<HTMLDivElement | null>(null);
  const lastAnchorIdRef = useRef<string | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const rowSnapRef = useRef<Array<{ idx: number; midY: number }>>([]);
  const [dragReorder, setDragReorder] = useState<{
    fromIndex: number;
    toIndex: number;
    startY: number;
    curY: number;
  } | null>(null);

  const selectedIndices = project.layers
    .map((l, idx) => (selectedIds.includes(l.id) ? idx : -1))
    .filter((idx) => idx >= 0);

  const hasSel = selectedIndices.length > 0;
  const targets = hasSel ? selectedIndices : [project.activeLayerIndex];
  const activeLayer = project.layers[project.activeLayerIndex];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') setPromptState(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          onUngroupLayers(targets);
          setSelectedIds([]);
        } else {
          onGroupLayers(targets, `Group ${project.groups.length + 1}`);
          setSelectedIds([]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setCtxMenu(null);
        setPromptState(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [targets, project.groups.length, onGroupLayers, onUngroupLayers]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [ctxMenu]);

  const toggleSel = (id: string) => {
    lastAnchorIdRef.current = id;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleRowClick = (e: React.MouseEvent, actualIndex: number, layerId: string) => {
    if (e.shiftKey) {
      const anchorId = lastAnchorIdRef.current ?? project.layers[project.activeLayerIndex]?.id;
      const anchorIdx = project.layers.findIndex((l) => l.id === anchorId);
      const start = anchorIdx >= 0 ? Math.min(anchorIdx, actualIndex) : actualIndex;
      const end = anchorIdx >= 0 ? Math.max(anchorIdx, actualIndex) : actualIndex;
      const rangeIds = project.layers.slice(start, end + 1).map((l) => l.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSel(layerId);
      return;
    }
    lastAnchorIdRef.current = layerId;
    onSelectLayer(actualIndex);
  };

  const commitPrompt = () => {
    if (!promptState) return;
    const trimmed = promptState.value.trim();
    if (promptState.kind === 'group') {
      onGroupLayers(promptState.targets, trimmed || `Group ${project.groups.length + 1}`);
      setSelectedIds([]);
    } else if (trimmed) {
      onRenameLayer(promptState.index, trimmed);
      setSelectedIds([]);
    }
    setPromptState(null);
  };

  const seenGroups = new Set<string>();
  const displayRows: Array<
    | { kind: 'group'; groupId: string }
    | { kind: 'layer'; actualIndex: number; inGroup: boolean }
  > = [];

  for (let d = 0; d < project.layers.length; d++) {
    const actualIndex = project.layers.length - 1 - d;
    const layer = project.layers[actualIndex];
    const group = layer.groupId
      ? project.groups.find((g) => g.id === layer.groupId)
      : undefined;
    if (group && !seenGroups.has(group.id)) {
      seenGroups.add(group.id);
      displayRows.push({ kind: 'group', groupId: group.id });
    }
    if (!group || !group.collapsed) {
      displayRows.push({
        kind: 'layer',
        actualIndex,
        inGroup: Boolean(group),
      });
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        zIndex: 28,
        display: 'flex',
        pointerEvents: 'none',
      }}
    >
      {/* Edge collapse handle on the left side of the right-hand drawer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={open ? 'Collapse layers drawer' : 'Expand layers drawer'}
          aria-expanded={open}
          title={open ? 'Collapse layers' : 'Expand layers'}
          style={{
            pointerEvents: 'auto',
            width: 28,
            height: 60,
            borderRadius: '10px 0 0 10px',
            border: '1px solid var(--border)',
            borderRight: 'none',
            background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            backdropFilter: 'blur(8px)',
          }}
        >
          {open ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Thin full-height collapsed strip on the right edge beside the tab */}
      <div
        aria-hidden="true"
        style={{
          pointerEvents: open ? 'none' : 'auto',
          width: open ? 0 : 14,
          opacity: open ? 0 : 1,
          height: '100%',
          background: 'var(--surface)',
          borderLeft: open ? 'none' : '1px solid var(--border)',
          transition: 'width 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease',
        }}
      />

      <aside
        aria-label="Layers drawer"
        aria-hidden={!open}
        inert={!open}
        className="layers-drawer"
        style={{
          position: 'relative',
          pointerEvents: open ? 'auto' : 'none',
          width: open ? `min(${width}px, 74vw)` : 0,
          opacity: open ? 1 : 0,
          height: '100%',
          background: 'var(--surface)',
          borderLeft: open ? '1px solid var(--border)' : '0px solid transparent',
          padding: open ? '12px 12px 12px 14px' : 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: isResizing
            ? 'none'
            : 'width 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease, padding 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {open && onWidthChange && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize layers panel"
            title="Drag to resize layers panel"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const startX = e.clientX;
              const startW = width;
              onResizingChange?.(true);
              const onMove = (ev: PointerEvent) => {
                const delta = startX - ev.clientX;
                const maxW = Math.min(420, Math.floor(window.innerWidth * 0.74));
                onWidthChange(Math.max(200, Math.min(maxW, startW + delta)));
              };
              const onUp = () => {
                onResizingChange?.(false);
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
              window.addEventListener('pointercancel', onUp);
            }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 6,
              cursor: 'ew-resize',
              zIndex: 5,
            }}
          />
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 10,
            minWidth: 210,
          }}
        >
          {hasSel ? (
            <>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 30, height: 30 }}
                aria-label="Clear layer selection"
                title="Clear selection"
                onClick={() => setSelectedIds([])}
              >
                <X size={15} />
              </button>
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                {selectedIndices.length} selected
              </span>
              <button
                type="button"
                className="btn"
                style={{ padding: '2px 7px', fontSize: 11 }}
                onClick={() => {
                  const allSelected = selectedIds.length === project.layers.length;
                  setSelectedIds(allSelected ? [] : project.layers.map((ly) => ly.id));
                }}
              >
                {selectedIds.length === project.layers.length ? 'None' : 'Select All'}
              </button>
            </>
          ) : (
            <span style={{ fontWeight: 700, fontSize: 15 }}>Layers</span>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            aria-label="Add new layer"
            title="New Layer"
            onClick={onAddLayer}
          >
            <Plus size={16} />
          </button>
        </div>

        {promptState && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitPrompt();
            }}
            style={{
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              marginBottom: 10,
              padding: 6,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-elevated)',
              minWidth: 210,
            }}
          >
            <input
              autoFocus
              aria-label={promptState.kind === 'group' ? 'Group name' : 'Layer name'}
              value={promptState.value}
              onChange={(e) => setPromptState({ ...promptState, value: e.target.value })}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 12,
              }}
            />
            <button type="submit" className="btn primary" style={{ padding: '4px 8px', fontSize: 11 }}>
              Save
            </button>
            <button
              type="button"
              className="btn"
              style={{ padding: '4px 6px', fontSize: 11 }}
              onClick={() => setPromptState(null)}
            >
              ×
            </button>
          </form>
        )}

        {/* Compact inline Opacity bar above the layer list */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 8px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface-elevated)',
            marginBottom: 8,
            minWidth: 200,
          }}
        >
          <label
            htmlFor="drawer-opacity-range"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >
            Opacity
          </label>
          <input
            id="drawer-opacity-range"
            type="range"
            className="color-slider"
            min={0}
            max={1}
            step={0.01}
            value={activeLayer.opacity}
            onChange={(e) =>
              onSetOpacity(project.activeLayerIndex, parseFloat(e.target.value))
            }
            style={{
              flex: 1,
              minWidth: 0,
              height: 10,
              background: `linear-gradient(to right, var(--accent) ${Math.round(activeLayer.opacity * 100)}%, var(--surface) ${Math.round(activeLayer.opacity * 100)}%)`,
            }}
          />
          <button
            type="button"
            className="mono"
            onClick={() => onSetOpacity(project.activeLayerIndex, 1)}
            title="Click to reset opacity to 100%"
            style={{
              border: 'none',
              background: 'transparent',
              padding: '2px 4px',
              minHeight: 24,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-primary)',
              minWidth: 34,
              textAlign: 'right',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {Math.round(activeLayer.opacity * 100)}%
          </button>
          <button
            type="button"
            className={`icon-btn ${activeLayer.alphaLocked ? 'active' : ''}`}
            style={{ width: 24, height: 24, flexShrink: 0 }}
            aria-label={activeLayer.alphaLocked ? 'Unlock transparent pixels' : 'Lock transparent pixels (Alpha Lock)'}
            aria-pressed={Boolean(activeLayer.alphaLocked)}
            title={activeLayer.alphaLocked ? 'Alpha Lock: On (paints only on existing pixels)' : 'Alpha Lock: Off'}
            onClick={() => onToggleAlphaLock(project.activeLayerIndex)}
          >
            <Lock size={12} />
          </button>
          {onToggleDimOthers && (
            <button
              type="button"
              className={`icon-btn ${dimOtherLayers ? 'active' : ''}`}
              style={{ width: 24, height: 24, flexShrink: 0 }}
              aria-label={dimOtherLayers ? 'Restore all layer opacities' : 'Dim other layers (25%)'}
              aria-pressed={dimOtherLayers}
              title={dimOtherLayers ? 'Dim Other Layers: On (25%)' : 'Dim Other Layers (isolate active layer)'}
              onClick={onToggleDimOthers}
            >
              <Contrast size={12} />
            </button>
          )}
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            minWidth: 210,
          }}
        >
          {displayRows.map((row) => {
            if (row.kind === 'group') {
              const g = project.groups.find((gr) => gr.id === row.groupId)!;
              const memberCount = project.layers.filter((ly) => ly.groupId === g.id).length;
              return (
                <div
                  key={`g_${g.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 6px',
                    borderRadius: 10,
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={!g.collapsed}
                    aria-label={`${g.collapsed ? 'Expand' : 'Collapse'} group ${g.name}`}
                    onClick={() => onToggleGroupCollapse(g.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      padding: '3px 4px',
                      borderRadius: 6,
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                    }}
                  >
                    {g.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    {g.collapsed ? (
                      <Folder size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    ) : (
                      <FolderOpen size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    )}
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {g.name}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 999,
                        padding: '0 5px',
                        flexShrink: 0,
                      }}
                    >
                      {memberCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 28, height: 28 }}
                    aria-label={`${g.visible ? 'Hide' : 'Show'} group ${g.name}`}
                    onClick={() => onToggleGroupVisibility(g.id)}
                  >
                    {g.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 28, height: 28 }}
                    aria-label={`Delete group ${g.name}`}
                    onClick={() => {
                      const layerIndices = project.layers
                        .map((lay, idx) => (lay.groupId === g.id ? idx : -1))
                        .filter((idx) => idx >= 0);
                      setDeleteGroupConfirm({ id: g.id, name: g.name, layerIndices });
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            }

            const l = project.layers[row.actualIndex];
            const isActive = row.actualIndex === project.activeLayerIndex;
            const isChecked = selectedIds.includes(l.id);
            const isDraggingThis = dragReorder?.fromIndex === row.actualIndex;
            const isDropTarget =
              dragReorder !== null &&
              dragReorder.toIndex === row.actualIndex &&
              dragReorder.fromIndex !== row.actualIndex;
            let rowTranslateY = 0;
            if (dragReorder) {
              if (isDraggingThis) {
                rowTranslateY = dragReorder.curY - dragReorder.startY;
              } else if (
                dragReorder.fromIndex < dragReorder.toIndex &&
                row.actualIndex > dragReorder.fromIndex &&
                row.actualIndex <= dragReorder.toIndex
              ) {
                rowTranslateY = 34;
              } else if (
                dragReorder.fromIndex > dragReorder.toIndex &&
                row.actualIndex < dragReorder.fromIndex &&
                row.actualIndex >= dragReorder.toIndex
              ) {
                rowTranslateY = -34;
              }
            }

            return (
              <div
                key={l.id}
                className={dragReorder !== null && !isDraggingThis ? 'layer-row' : undefined}
                ref={(el) => {
                  if (el) rowRefs.current.set(row.actualIndex, el);
                  else rowRefs.current.delete(row.actualIndex);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const menuTargets =
                    selectedIds.includes(l.id) && selectedIndices.length > 0
                      ? selectedIndices
                      : [row.actualIndex];
                  setCopyFrameSubOpen(false);
                  setCtxMenu({
                    x: Math.max(8, Math.min(e.clientX, window.innerWidth - 194)),
                    y: Math.max(8, Math.min(e.clientY, window.innerHeight - 260)),
                    targets: menuTargets,
                  });
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button, input')) return;
                  handleRowClick(e, row.actualIndex, l.id);
                }}
                style={{
                  marginLeft: row.inGroup ? 14 : 0,
                  padding: '5px 6px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  border: `1px solid ${
                    isDropTarget || isChecked || isActive
                      ? 'var(--accent)'
                      : 'var(--border)'
                  }`,
                  boxShadow: isDraggingThis
                    ? '0 6px 16px rgba(0, 0, 0, 0.25)'
                    : isDropTarget
                      ? '0 0 0 1px var(--accent)'
                      : undefined,
                  opacity: isDraggingThis ? 0.92 : 1,
                  transform: `translateY(${rowTranslateY}px) ${
                    isDraggingThis ? 'scale(1.02)' : 'scale(1)'
                  }`,
                  transition:
                    dragReorder !== null && !isDraggingThis
                      ? 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 150ms ease'
                      : 'none',
                  position: 'relative',
                  zIndex: isDraggingThis ? 5 : 1,
                  background: isChecked
                    ? 'var(--accent-container)'
                    : isActive
                      ? 'color-mix(in srgb, var(--accent-container) 55%, var(--surface-elevated))'
                      : 'var(--surface-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {row.inGroup && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: -10,
                      top: -4,
                      bottom: -4,
                      width: 2,
                      borderRadius: 1,
                      background: 'var(--border)',
                    }}
                  />
                )}
                <button
                  type="button"
                  aria-label={`Drag or press Alt+ArrowUp/Down to reorder ${l.name}`}
                  title="Drag up/down or Alt+Arrow keys to reorder"
                  onKeyDown={(e) => {
                    if (e.altKey && e.key === 'ArrowUp' && row.actualIndex < project.layers.length - 1) {
                      e.preventDefault();
                      onReorderLayer(row.actualIndex, row.actualIndex + 1);
                    } else if (e.altKey && e.key === 'ArrowDown' && row.actualIndex > 0) {
                      e.preventDefault();
                      onReorderLayer(row.actualIndex, row.actualIndex - 1);
                    }
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const snap: Array<{ idx: number; midY: number }> = [];
                    rowRefs.current.forEach((el, idx) => {
                      const rect = el.getBoundingClientRect();
                      snap.push({ idx, midY: rect.top + rect.height / 2 });
                    });
                    rowSnapRef.current = snap;
                    setDragReorder({
                      fromIndex: row.actualIndex,
                      toIndex: row.actualIndex,
                      startY: e.clientY,
                      curY: e.clientY,
                    });
                  }}
                  onPointerMove={(e) => {
                    if (!dragReorder) return;
                    let bestIdx = dragReorder.toIndex;
                    let bestDist = Infinity;
                    for (const item of rowSnapRef.current) {
                      const d = Math.abs(e.clientY - item.midY);
                      if (d < bestDist) {
                        bestDist = d;
                        bestIdx = item.idx;
                      }
                    }
                    setDragReorder({
                      ...dragReorder,
                      toIndex: bestIdx,
                      curY: e.clientY,
                    });
                  }}
                  onPointerUp={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                    if (dragReorder && dragReorder.fromIndex !== dragReorder.toIndex) {
                      onReorderLayer(dragReorder.fromIndex, dragReorder.toIndex);
                    }
                    setDragReorder(null);
                  }}
                  onPointerCancel={() => setDragReorder(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 32,
                    cursor: 'grab',
                    touchAction: 'none',
                    color: 'var(--text-muted)',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <GripVertical size={13} />
                </button>
                <input
                  type="checkbox"
                  aria-label={`Select ${l.name} for group or batch actions`}
                  checked={isChecked}
                  onChange={() => toggleSel(l.id)}
                  style={{ cursor: 'pointer', flexShrink: 0, width: 16, height: 16, margin: 4 }}
                />
                <LayerThumb
                  layer={l}
                  width={project.width}
                  height={project.height}
                  revision={revision}
                />
                {inlineRename?.index === row.actualIndex ? (
                  <form
                    style={{ flex: 1, minWidth: 0 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = inlineRename.value.trim();
                      if (trimmed) onRenameLayer(row.actualIndex, trimmed);
                      setInlineRename(null);
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Layer name"
                      value={inlineRename.value}
                      onChange={(e) =>
                        setInlineRename({ index: row.actualIndex, value: e.target.value })
                      }
                      onBlur={() => {
                        const trimmed = inlineRename.value.trim();
                        if (trimmed) onRenameLayer(row.actualIndex, trimmed);
                        setInlineRename(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setInlineRename(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        padding: '2px 5px',
                        borderRadius: 5,
                        border: '1px solid var(--accent)',
                        background: 'var(--surface)',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => handleRowClick(e, row.actualIndex, l.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setInlineRename({ index: row.actualIndex, value: l.name });
                    }}
                    title="Click to draw • Double-click to rename • Shift+Click range • Right-click for properties"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 24,
                      background: 'transparent',
                      border: 'none',
                      padding: '3px 0',
                      textAlign: 'left',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: isActive ? 700 : 500,
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {l.name}
                      </span>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  className={`icon-btn ${l.alphaLocked ? 'active' : ''}`}
                  style={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    opacity: l.alphaLocked ? 1 : 0.55,
                  }}
                  aria-label={l.alphaLocked ? `Unlock alpha for ${l.name}` : `Lock alpha for ${l.name}`}
                  aria-pressed={Boolean(l.alphaLocked)}
                  title={l.alphaLocked ? 'Alpha Lock: On (click to unlock)' : 'Alpha Lock: Off (click to lock)'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleAlphaLock(row.actualIndex);
                  }}
                >
                  <Lock size={12} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 28, height: 28, flexShrink: 0 }}
                  aria-label={`Layer options for ${l.name}`}
                  title="Layer options"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const menuTargets =
                      selectedIds.includes(l.id) && selectedIndices.length > 0
                        ? selectedIndices
                        : [row.actualIndex];
                    setCtxMenu({
                      x: Math.min(rect.right + 4, window.innerWidth - 190),
                      y: Math.min(rect.top, window.innerHeight - 230),
                      targets: menuTargets,
                    });
                  }}
                >
                  <MoreHorizontal size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 28, height: 28, flexShrink: 0 }}
                  aria-label={`${l.visible ? 'Hide' : 'Show'} ${l.name}`}
                  title={l.visible ? 'Hide layer' : 'Show layer'}
                  onClick={() => onToggleVisibility(row.actualIndex)}
                >
                  {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          role="menu"
          className="floating-card menu-pop"
          style={{
            pointerEvents: 'auto',
            position: 'fixed',
            left: ctxMenu.x,
            top: ctxMenu.y,
            width: 186,
            padding: 6,
            zIndex: 80,
            background: 'var(--surface-elevated)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="btn"
            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
            onClick={() => {
              const t = ctxMenu.targets;
              setCtxMenu(null);
              setPromptState({
                kind: 'group',
                value: `Group ${project.groups.length + 1}`,
                targets: t,
              });
            }}
          >
            Group (Ctrl+G)
          </button>
          <button
            type="button"
            role="menuitem"
            className="btn"
            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
            onClick={() => {
              const t = ctxMenu.targets;
              setCtxMenu(null);
              onUngroupLayers(t);
              setSelectedIds([]);
            }}
          >
            Ungroup (Ctrl+Shift+G)
          </button>
          {(ctxMenu.targets.length >= 2 || ctxMenu.targets[0] > 0) && (
            <button
              type="button"
              role="menuitem"
              className="btn"
              style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
              onClick={() => {
                const t = ctxMenu.targets;
                setCtxMenu(null);
                onMergeLayers(t);
                setSelectedIds([]);
              }}
            >
              {ctxMenu.targets.length >= 2
                ? `Merge Selected (${ctxMenu.targets.length})`
                : 'Merge Down'}
            </button>
          )}
          {ctxMenu.targets.length === 1 && (
            <>
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
                onClick={() => {
                  const idx = ctxMenu.targets[0];
                  setCtxMenu(null);
                  onToggleAlphaLock(idx);
                }}
              >
                {project.layers[ctxMenu.targets[0]]?.alphaLocked ? 'Alpha Lock: On' : 'Alpha Lock: Off'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
                onClick={() => {
                  const idx = ctxMenu.targets[0];
                  setCtxMenu(null);
                  setPromptState({
                    kind: 'rename',
                    value: project.layers[idx].name,
                    index: idx,
                  });
                }}
              >
                Rename
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="btn"
            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
            onClick={() => {
              const t = ctxMenu.targets;
              setCtxMenu(null);
              onDuplicateLayers(t);
              setSelectedIds([]);
            }}
          >
            Duplicate
          </button>
          {(project.frames?.length ?? 1) > 1 && onCopyLayersToFrame && (() => {
            const frames = project.frames ?? [];
            const activeFrameIdx = project.activeFrameIndex ?? 0;
            const canOpenLeft = ctxMenu.x >= 170;
            const canOpenRight = ctxMenu.x + 186 + 164 <= window.innerWidth;
            const subStyle: React.CSSProperties = canOpenLeft
              ? { right: '100%', paddingRight: 4, top: -4 }
              : canOpenRight
                ? { left: '100%', paddingLeft: 4, top: -4 }
                : { right: 0, top: '100%', paddingTop: 4 };
            return (
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => setCopyFrameSubOpen(true)}
                onMouseLeave={() => setCopyFrameSubOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={copyFrameSubOpen}
                  className="btn"
                  style={{ width: '100%', border: 'none', justifyContent: 'space-between', fontSize: 12 }}
                  onClick={() => setCopyFrameSubOpen((v) => !v)}
                >
                  <span>Copy to Frame</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
                </button>
                {copyFrameSubOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      ...subStyle,
                      zIndex: 81,
                    }}
                  >
                    <div
                      role="menu"
                      className="floating-card menu-pop"
                      style={{
                        width: 156,
                        maxHeight: 'min(260px, calc(100vh - 24px))',
                        overflowY: 'auto',
                        padding: 5,
                        background: 'var(--surface-elevated)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      {frames.map((frame, fIdx) => {
                        if (fIdx === activeFrameIdx) return null;
                        return (
                          <button
                            key={frame.id}
                            type="button"
                            role="menuitem"
                            className="btn"
                            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
                            onClick={() => {
                              const t = ctxMenu.targets;
                              setCopyFrameSubOpen(false);
                              setCtxMenu(null);
                              onCopyLayersToFrame(t, fIdx);
                              setSelectedIds([]);
                            }}
                          >
                            Frame {fIdx + 1}
                          </button>
                        );
                      })}
                      <div style={{ height: 1, background: 'var(--border)', margin: '2px 4px' }} />
                      <button
                        type="button"
                        role="menuitem"
                        className="btn"
                        style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12, fontWeight: 600 }}
                        onClick={() => {
                          const t = ctxMenu.targets;
                          setCopyFrameSubOpen(false);
                          setCtxMenu(null);
                          onCopyLayersToFrame(t, 'all');
                          setSelectedIds([]);
                        }}
                      >
                        All Other Frames
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <button
            type="button"
            role="menuitem"
            className="btn"
            style={{
              border: 'none',
              justifyContent: 'flex-start',
              fontSize: 12,
              color: 'var(--danger)',
            }}
            onClick={() => {
              const t = ctxMenu.targets;
              setCtxMenu(null);
              setDeleteLayersConfirm(t);
            }}
          >
            {ctxMenu.targets.length > 1
              ? `Delete Selected (${ctxMenu.targets.length})`
              : 'Delete Layer'}
          </button>
        </div>
      )}

      {deleteGroupConfirm && (
        <DeleteGroupModal
          groupName={deleteGroupConfirm.name}
          layerCount={deleteGroupConfirm.layerIndices.length}
          onCancel={() => setDeleteGroupConfirm(null)}
          onUngroupOnly={() => {
            onDeleteGroup(deleteGroupConfirm.id);
            setDeleteGroupConfirm(null);
          }}
          onDeleteAll={() => {
            const { id, layerIndices } = deleteGroupConfirm;
            onDeleteGroup(id);
            if (layerIndices.length > 0) {
              onDeleteLayers(layerIndices);
            }
            setSelectedIds([]);
            setDeleteGroupConfirm(null);
          }}
        />
      )}

      {deleteLayersConfirm && (
        <DeleteLayersModal
          layerNames={deleteLayersConfirm.map(
            (idx) => project.layers[idx]?.name ?? `Layer ${idx + 1}`
          )}
          onCancel={() => setDeleteLayersConfirm(null)}
          onConfirm={() => {
            onDeleteLayers(deleteLayersConfirm);
            setSelectedIds([]);
            setDeleteLayersConfirm(null);
          }}
        />
      )}
    </div>
  );
}
