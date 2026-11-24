import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Contrast,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { PixelProject } from '../engine/types';

export function LayersPanel({
  project,
  open,
  width = 244,
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
          background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
          borderLeft: open ? 'none' : '1px solid var(--border)',
          backdropFilter: 'blur(8px)',
          transition: 'width 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease',
        }}
      />

      <aside
        aria-label="Layers drawer"
        aria-hidden={!open}
        className="layers-drawer"
        style={{
          position: 'relative',
          pointerEvents: open ? 'auto' : 'none',
          width: open ? `min(${width}px, 74vw)` : 0,
          opacity: open ? 1 : 0,
          height: '100%',
          background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
          borderLeft: open ? '1px solid var(--border)' : 'none',
          backdropFilter: 'blur(8px)',
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
              padding: 0,
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
              return (
                <div
                  key={`g_${g.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    padding: '2px 0 0',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
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
                      gap: 3,
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: 6,
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                    }}
                  >
                    {g.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {g.name}
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
                  setCtxMenu({
                    x: Math.min(e.clientX, window.innerWidth - 190),
                    y: Math.min(e.clientY, window.innerHeight - 230),
                    targets: menuTargets,
                  });
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button, input')) return;
                  handleRowClick(e, row.actualIndex, l.id);
                }}
                style={{
                  marginLeft: row.inGroup ? 10 : 0,
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
                  style={{ cursor: 'pointer', flexShrink: 0 }}
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
                      background: 'transparent',
                      border: 'none',
                      padding: '2px 0',
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
                      {l.alphaLocked && (
                        <Lock size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      )}
                    </div>
                  </button>
                )}
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
              onDeleteLayers(t);
              setSelectedIds([]);
            }}
          >
            {ctxMenu.targets.length > 1
              ? `Delete Selected (${ctxMenu.targets.length})`
              : 'Delete Layer'}
          </button>
        </div>
      )}

      {deleteGroupConfirm && (
        <div
          className="modal-backdrop"
          style={{ pointerEvents: 'auto' }}
          onClick={() => setDeleteGroupConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-group-title"
            className="floating-card"
            style={{
              width: 'min(380px, calc(100vw - 24px))',
              padding: 18,
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 id="delete-group-title" style={{ margin: 0, fontSize: 15 }}>
                Delete Group &ldquo;{deleteGroupConfirm.name}&rdquo;?
              </h3>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 28, height: 28, flexShrink: 0 }}
                aria-label="Close dialog"
                onClick={() => setDeleteGroupConfirm(null)}
              >
                <X size={15} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This group contains {deleteGroupConfirm.layerIndices.length} layer
              {deleteGroupConfirm.layerIndices.length === 1 ? '' : 's'}. Choose whether to keep them ungrouped or delete everything inside.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  onDeleteGroup(deleteGroupConfirm.id);
                  setDeleteGroupConfirm(null);
                }}
              >
                Ungroup Only (Keep Layers)
              </button>
              <button
                type="button"
                className="btn primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  background: 'var(--danger)',
                  borderColor: 'var(--danger)',
                }}
                onClick={() => {
                  const { id, layerIndices } = deleteGroupConfirm;
                  onDeleteGroup(id);
                  if (layerIndices.length > 0) {
                    onDeleteLayers(layerIndices);
                  }
                  setSelectedIds([]);
                  setDeleteGroupConfirm(null);
                }}
              >
                Delete Group &amp; Layers
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
