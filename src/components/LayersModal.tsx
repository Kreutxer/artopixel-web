import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  MoreVertical,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { PixelProject } from '../engine/types';

export function LayersModal({
  project,
  onSelectLayer,
  onAddLayer,
  onToggleVisibility,
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
  onClose,
}: {
  project: PixelProject;
  onSelectLayer: (idx: number) => void;
  onAddLayer: () => void;
  onToggleVisibility: (idx: number) => void;
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
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptState, setPromptState] = useState<
    | { kind: 'group'; value: string; targets: number[] }
    | { kind: 'rename'; value: string; index: number }
    | null
  >(null);

  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (promptState) {
          setPromptState(null);
        } else if (menuOpen) {
          setMenuOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, promptState, onClose]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  const selectedIndices = project.layers
    .map((l, idx) => (selectedIds.includes(l.id) ? idx : -1))
    .filter((idx) => idx >= 0);

  const hasSel = selectedIndices.length > 0;
  const targets = hasSel ? selectedIndices : [project.activeLayerIndex];
  const activeLayer = project.layers[project.activeLayerIndex];

  const toggleSel = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="layers-modal-title"
        className="floating-card"
        style={{
          width: 'min(360px, calc(100vw - 24px))',
          padding: 18,
          background: 'var(--surface)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={menuContainerRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            position: 'relative',
          }}
        >
          {hasSel ? (
            <>
              <button
                type="button"
                className="icon-btn"
                aria-label="Clear layer selection"
                title="Clear selection"
                onClick={() => setSelectedIds([])}
              >
                <X size={18} />
              </button>
              <span id="layers-modal-title" style={{ fontWeight: 700 }}>
                {selectedIndices.length} selected
              </span>
            </>
          ) : (
            <span id="layers-modal-title" style={{ fontWeight: 700, fontSize: 17 }}>
              Layers
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onAddLayer}>
            <Plus size={15} /> New Layer
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Layer actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="Layer actions"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="floating-card"
              style={{
                position: 'absolute',
                top: 42,
                right: 0,
                width: 190,
                padding: 6,
                zIndex: 10,
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
                style={{ border: 'none', justifyContent: 'flex-start' }}
                onClick={() => {
                  setMenuOpen(false);
                  setPromptState({
                    kind: 'group',
                    value: `Group ${project.groups.length + 1}`,
                    targets,
                  });
                }}
              >
                Group Selected
              </button>
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start' }}
                onClick={() => {
                  setMenuOpen(false);
                  onUngroupLayers(targets);
                  setSelectedIds([]);
                }}
              >
                Ungroup
              </button>
              {(targets.length >= 2 || targets[0] > 0) && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setMenuOpen(false);
                    onMergeLayers(targets);
                    setSelectedIds([]);
                  }}
                >
                  {targets.length >= 2
                    ? `Merge Selected (${targets.length})`
                    : 'Merge Down'}
                </button>
              )}
              {targets.length === 1 && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setMenuOpen(false);
                    setPromptState({
                      kind: 'rename',
                      value: project.layers[targets[0]].name,
                      index: targets[0],
                    });
                  }}
                >
                  Rename
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start' }}
                onClick={() => {
                  setMenuOpen(false);
                  onDuplicateLayers(targets);
                  setSelectedIds([]);
                }}
              >
                Duplicate
              </button>
              {project.layers.length - targets.length >= 1 && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{
                    border: 'none',
                    justifyContent: 'flex-start',
                    color: 'var(--danger)',
                  }}
                  onClick={() => {
                    setMenuOpen(false);
                    onDeleteLayers(targets);
                    setSelectedIds([]);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>

        {promptState && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitPrompt();
            }}
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              marginBottom: 12,
              padding: 8,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface-elevated)',
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
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
            <button type="submit" className="btn primary" style={{ padding: '6px 10px' }}>
              Save
            </button>
            <button
              type="button"
              className="btn"
              style={{ padding: '6px 10px' }}
              onClick={() => setPromptState(null)}
            >
              Cancel
            </button>
          </form>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface-elevated)',
            marginBottom: 12,
          }}
        >
          <label htmlFor="layer-opacity-range" className="mono" style={{ fontSize: 12 }}>
            Opacity
          </label>
          <input
            id="layer-opacity-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={activeLayer.opacity}
            onChange={(e) =>
              onSetOpacity(project.activeLayerIndex, parseFloat(e.target.value))
            }
            style={{ flex: 1 }}
          />
          <span className="mono" style={{ fontSize: 12, width: 38, textAlign: 'right' }}>
            {Math.round(activeLayer.opacity * 100)}%
          </span>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {displayRows.map((row) => {
            if (row.kind === 'group') {
              const g = project.groups.find((gr) => gr.id === row.groupId)!;
              return (
                <div
                  key={`g_${g.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 2px 0',
                    fontSize: 12,
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
                      gap: 4,
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: 6,
                    }}
                  >
                    {g.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    {g.name}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 28, height: 28 }}
                    aria-label={`${g.visible ? 'Hide' : 'Show'} group ${g.name}`}
                    onClick={() => onToggleGroupVisibility(g.id)}
                  >
                    {g.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 28, height: 28 }}
                    aria-label={`Delete group ${g.name}`}
                    onClick={() => onDeleteGroup(g.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            }

            const l = project.layers[row.actualIndex];
            const isActive = row.actualIndex === project.activeLayerIndex;
            const isChecked = selectedIds.includes(l.id);

            return (
              <div
                key={l.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleSel(l.id);
                }}
                style={{
                  marginLeft: row.inGroup ? 14 : 0,
                  padding: '6px 8px',
                  borderRadius: 12,
                  border: `1px solid ${
                    isChecked || isActive ? 'var(--accent)' : 'var(--border)'
                  }`,
                  background: isChecked
                    ? 'var(--accent-container)'
                    : isActive
                      ? 'color-mix(in srgb, var(--accent-container) 55%, var(--surface-elevated))'
                      : 'var(--surface-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {hasSel ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${l.name}`}
                    checked={isChecked}
                    onChange={() => toggleSel(l.id)}
                  />
                ) : (
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 32, height: 32 }}
                    aria-label={`${l.visible ? 'Hide' : 'Show'} ${l.name}`}
                    onClick={() => onToggleVisibility(row.actualIndex)}
                  >
                    {l.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (hasSel) toggleSel(l.id);
                    else onSelectLayer(row.actualIndex);
                  }}
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
                  <div style={{ fontWeight: isActive ? 700 : 500, fontSize: 13 }}>
                    {l.name}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {Math.round(l.opacity * 100)}% opacity
                  </div>
                </button>
                {row.actualIndex < project.layers.length - 1 && (
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 32, height: 32 }}
                    aria-label={`Move ${l.name} up`}
                    onClick={() => onReorderLayer(row.actualIndex, row.actualIndex + 1)}
                  >
                    <ArrowUp size={15} />
                  </button>
                )}
                {row.actualIndex > 0 && (
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 32, height: 32 }}
                    aria-label={`Move ${l.name} down`}
                    onClick={() => onReorderLayer(row.actualIndex, row.actualIndex - 1)}
                  >
                    <ArrowDown size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
