import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Files, Pencil, Plus, Trash2, X } from 'lucide-react';
import { CanvasDoc } from '../../engine/types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const PRESETS = [16, 32, 64, 128];

export function CanvasTabsBar({
  canvases,
  activeCanvasIndex,
  openCanvasIds,
  open = true,
  onToggleOpen,
  onSelectCanvas,
  onHideCanvasTab,
  onOpenCanvasTab,
  onAddCanvas,
  onRenameCanvas,
  onReorderCanvas,
  onDeleteCanvas,
  onCollapsedHudLeftChange,
}: {
  canvases: CanvasDoc[];
  activeCanvasIndex: number;
  openCanvasIds: string[];
  open?: boolean;
  onToggleOpen?: () => void;
  onSelectCanvas: (idx: number) => void;
  onHideCanvasTab: (id: string) => void;
  onOpenCanvasTab: (id: string) => void;
  onAddCanvas: (name: string, width: number, height: number) => void;
  onRenameCanvas: (idx: number, name: string) => void;
  onReorderCanvas?: (fromIdx: number, toIdx: number) => void;
  onDeleteCanvas: (idx: number) => void;
  onCollapsedHudLeftChange?: (leftPx: number) => void;
}) {
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newW, setNewW] = useState('32');
  const [newH, setNewH] = useState('32');
  const [newErr, setNewErr] = useState<string | null>(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  const explorerRef = useRef<HTMLDivElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const newDialogRef = useRef<HTMLDivElement | null>(null);
  const delDialogRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(() => setExplorerOpen(false), explorerOpen);
  useEscapeKey(() => setAddMenuOpen(false), addMenuOpen);
  useEscapeKey(() => setShowNewModal(false), showNewModal);
  useEscapeKey(() => setConfirmDeleteIdx(null), confirmDeleteIdx !== null);
  useFocusTrap(newDialogRef, showNewModal);
  useFocusTrap(delDialogRef, confirmDeleteIdx !== null);

  useEffect(() => {
    if (!explorerOpen) return;
    const onDown = (e: PointerEvent) => {
      if (explorerRef.current && !explorerRef.current.contains(e.target as Node)) {
        setExplorerOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [explorerOpen]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [addMenuOpen]);

  useEffect(() => {
    if (!open) setAddMenuOpen(false);
  }, [open]);

  const activeCanvasId = canvases[activeCanvasIndex]?.id;
  const activeCanvasName = canvases[activeCanvasIndex]?.name;
  const activeCanvasWidth = canvases[activeCanvasIndex]?.width;
  const activeCanvasHeight = canvases[activeCanvasIndex]?.height;

  useLayoutEffect(() => {
    if (open || !onCollapsedHudLeftChange) return;
    const measure = () => {
      const el = activeTabRef.current;
      if (!el) return;
      onCollapsedHudLeftChange(el.offsetLeft + el.offsetWidth + 8);
    };
    measure();
    const t = setTimeout(measure, 240);
    return () => clearTimeout(t);
  }, [open, activeCanvasId, activeCanvasName, activeCanvasWidth, activeCanvasHeight, onCollapsedHudLeftChange]);

  const openNewCanvasModal = () => {
    setExplorerOpen(false);
    setNewName(`Canvas ${canvases.length + 1}`);
    setNewW('32');
    setNewH('32');
    setNewErr(null);
    setShowNewModal(true);
  };

  const handleCreate = () => {
    const w = parseInt(newW, 10);
    const h = parseInt(newH, 10);
    if (isNaN(w) || isNaN(h) || w < 4 || h < 4 || w > 512 || h > 512) {
      setNewErr('Width and height must be between 4 and 512.');
      return;
    }
    onAddCanvas(newName.trim() || `Canvas ${canvases.length + 1}`, w, h);
    setShowNewModal(false);
  };

  const visibleTabs = canvases
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => openCanvasIds.includes(c.id));

  return (
    <>
      <div
        className="ui-scaled"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          pointerEvents: 'none',
          zIndex: 40,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--surface-elevated)',
              boxShadow: 'inset 0 -1px 0 color-mix(in srgb, var(--text-muted) 42%, var(--border))',
              transform: open ? 'translateY(0)' : 'translateY(-100%)',
              transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>
        <div
          role="tablist"
          aria-label="Project canvases"
          className="no-scrollbar"
          style={{
            position: 'relative',
            zIndex: 1,
            height: 34,
            overflowX: 'auto',
            overflowY: 'hidden',
            background: 'transparent',
            transition: 'gap 220ms cubic-bezier(0.22, 1, 0.36, 1)',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '4px 12px 0',
            gap: open ? 3 : 0,
            pointerEvents: 'none',
          }}
        >
          <div
            ref={explorerRef}
            style={{
              position: 'relative',
              alignSelf: 'center',
              marginRight: 4,
              pointerEvents: 'auto',
            }}
          >
            <button
              type="button"
              className={`icon-btn ${explorerOpen ? 'active' : ''}`}
              style={{
                width: 26,
                height: 24,
                borderRadius: 6,
                background: open ? undefined : 'var(--surface)',
                borderColor: open ? undefined : 'var(--border)',
              }}
              aria-label="Project canvases"
              aria-expanded={explorerOpen}
              title={`Project Canvases (${canvases.length})`}
              onClick={() => setExplorerOpen((v) => !v)}
            >
              <Files size={14} />
            </button>

          {explorerOpen && (() => {
            const rect = explorerRef.current?.getBoundingClientRect();
            const top = rect ? rect.bottom + 4 : 88;
            const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 260)) : 8;
            return (
              <div
                className="floating-card menu-pop"
                style={{
                  position: 'fixed',
                  top,
                  left,
                  width: 248,
                  maxHeight: 'min(360px, calc(100vh - 110px))',
                  overflowY: 'auto',
                  padding: 8,
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  zIndex: 70,
                  transformOrigin: 'top left',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '2px 4px 4px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Project Canvases ({canvases.length})
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 24, height: 24 }}
                    aria-label="New canvas"
                    title="New Canvas"
                    onClick={openNewCanvasModal}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {canvases.map((c, idx) => {
                  const isActive = idx === activeCanvasIndex;
                  const isOpen = openCanvasIds.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 6px',
                        borderRadius: 7,
                        background: isActive ? 'var(--accent-container)' : 'var(--surface-elevated)',
                        border: isActive
                          ? '1px solid color-mix(in srgb, var(--accent) 45%, transparent)'
                          : '1px solid transparent',
                      }}
                    >
                      {renamingIdx === idx ? (
                        <form
                          style={{ flex: 1, minWidth: 0 }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const trimmed = renameDraft.trim();
                            if (trimmed) onRenameCanvas(idx, trimmed);
                            setRenamingIdx(null);
                          }}
                        >
                          <input
                            autoFocus
                            aria-label="Canvas name"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onBlur={() => {
                              const trimmed = renameDraft.trim();
                              if (trimmed) onRenameCanvas(idx, trimmed);
                              setRenamingIdx(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                setRenamingIdx(null);
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '2px 5px',
                              borderRadius: 4,
                              border: '1px solid var(--accent)',
                              background: 'var(--surface)',
                              color: 'var(--text-primary)',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          />
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenCanvasTab(c.id);
                              onSelectCanvas(idx);
                              setExplorerOpen(false);
                            }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              border: 'none',
                              background: 'transparent',
                              padding: 0,
                              textAlign: 'left',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: isActive ? 700 : 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.name}
                            </span>
                            <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {c.width}×{c.height}
                            </span>
                            {!isOpen && (
                              <span
                                style={{
                                  fontSize: 9.5,
                                  color: 'var(--text-muted)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 4,
                                  padding: '0 4px',
                                }}
                              >
                                hidden
                              </span>
                            )}
                          </button>

                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: 26, height: 26 }}
                            aria-label={`Rename ${c.name}`}
                            title="Rename"
                            onClick={() => {
                              setRenameDraft(c.name);
                              setRenamingIdx(idx);
                            }}
                          >
                            <Pencil size={13} />
                          </button>

                          {canvases.length > 1 && (
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ width: 26, height: 26, color: 'var(--danger)' }}
                              aria-label={`Delete ${c.name}`}
                              title="Delete permanently"
                              onClick={() => {
                                setExplorerOpen(false);
                                setConfirmDeleteIdx(idx);
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {visibleTabs.map(({ c, idx }) => {
          const isActive = idx === activeCanvasIndex;
          const isVisible = open || isActive;
          const isDropTarget = dragOverIdx === idx && dragFromIdx !== null && dragFromIdx !== idx;
          return (
            <div
              key={c.id}
              ref={isActive ? activeTabRef : undefined}
              role="tab"
              aria-selected={isActive}
              aria-hidden={!isVisible}
              draggable={open && renamingIdx !== idx && Boolean(onReorderCanvas)}
              onDragStart={(e) => {
                setDragFromIdx(idx);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(idx));
              }}
              onDragOver={(e) => {
                if (dragFromIdx === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverIdx !== idx) setDragOverIdx(idx);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFromIdx !== null && dragFromIdx !== idx) {
                  onReorderCanvas?.(dragFromIdx, idx);
                }
                setDragFromIdx(null);
                setDragOverIdx(null);
              }}
              onDragEnd={() => {
                setDragFromIdx(null);
                setDragOverIdx(null);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: isVisible ? 5 : 0,
                height: isActive ? (open ? 29 : 24) : 27,
                maxWidth: isVisible ? 200 : 0,
                padding: isVisible
                  ? open && visibleTabs.length > 1
                    ? '0 5px 0 10px'
                    : '0 10px'
                  : 0,
                overflow: 'hidden',
                borderRadius: open ? '8px 8px 0 0' : 8,
                borderTop: isActive
                  ? '1px solid color-mix(in srgb, var(--text-muted) 42%, var(--border))'
                  : '1px solid transparent',
                borderLeft: isDropTarget
                  ? '2px solid var(--accent)'
                  : isActive
                    ? '1px solid color-mix(in srgb, var(--text-muted) 42%, var(--border))'
                    : '1px solid transparent',
                borderRight: isActive
                  ? '1px solid color-mix(in srgb, var(--text-muted) 42%, var(--border))'
                  : '1px solid transparent',
                borderBottom: isActive
                  ? open
                    ? '1px solid var(--surface)'
                    : '1px solid color-mix(in srgb, var(--text-muted) 42%, var(--border))'
                  : open && isVisible
                    ? '1px solid color-mix(in srgb, var(--text-muted) 42%, var(--border))'
                    : '1px solid transparent',
                marginBottom: isActive && !open ? 3 : 0,
                background: isActive
                  ? open
                    ? 'var(--surface)'
                    : 'var(--surface-elevated)'
                  : 'color-mix(in srgb, var(--text-muted) 9%, transparent)',
                boxShadow: 'none',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                opacity: !isVisible ? 0 : dragFromIdx === idx ? 0.5 : 1,
                flexShrink: 0,
                position: 'relative',
                pointerEvents: isVisible ? 'auto' : 'none',
                transition:
                  'max-width 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease, padding 220ms cubic-bezier(0.22, 1, 0.36, 1), height 220ms cubic-bezier(0.22, 1, 0.36, 1), margin-bottom 220ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 200ms ease, border-color 200ms ease, background 200ms ease, box-shadow 200ms ease, gap 220ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 8,
                    right: 8,
                    height: 2,
                    borderRadius: 2,
                    background: 'var(--accent)',
                    opacity: open ? 1 : 0,
                    transform: open ? 'scaleX(1)' : 'scaleX(0.35)',
                    transition: 'opacity 180ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  if (isActive) {
                    onToggleOpen?.();
                  } else {
                    onSelectCanvas(idx);
                  }
                }}
                title={isActive ? 'Click to hide other tabs & widen workspace' : `Switch to ${c.name}`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  fontSize: 11.5,
                  fontWeight: isActive ? 700 : 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: 0,
                  cursor: 'pointer',
                  maxWidth: 150,
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.name}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                >
                  {c.width}×{c.height}
                </span>
              </button>

              {open && visibleTabs.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 22, height: 22, borderRadius: 5 }}
                  aria-label={`Hide tab ${c.name}`}
                  title="Hide tab (re-open from Project Canvases)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHideCanvasTab(c.id);
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}

        <div
          ref={addMenuRef}
          style={{
            position: 'relative',
            alignSelf: 'center',
            flexShrink: 0,
            marginLeft: open ? 2 : 0,
            width: open ? 24 : 0,
            height: 24,
            overflow: open ? 'visible' : 'hidden',
            opacity: open ? 1 : 0,
            transform: open ? 'none' : 'translateY(-8px)',
            pointerEvents: open ? 'auto' : 'none',
            transition:
              'opacity 180ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1), width 220ms cubic-bezier(0.22, 1, 0.36, 1), margin-left 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <button
            type="button"
            className={`icon-btn ${addMenuOpen ? 'active' : ''}`}
            style={{ width: 24, height: 24, borderRadius: 6 }}
            aria-label="Add or open canvas tab"
            aria-expanded={addMenuOpen}
            aria-hidden={!open}
            tabIndex={open ? 0 : -1}
            title="New or Open Canvas Tab"
            onClick={() => setAddMenuOpen((v) => !v)}
          >
            <Plus size={14} />
          </button>
          {addMenuOpen && open && (() => {
            const rect = addMenuRef.current?.getBoundingClientRect();
            const top = rect ? rect.bottom + 4 : 88;
            const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 220)) : 8;
            const hiddenCanvases = canvases
              .map((c, idx) => ({ c, idx }))
              .filter(({ c }) => !openCanvasIds.includes(c.id));
            return (
              <div
                className="floating-card menu-pop"
                style={{
                  position: 'fixed',
                  top,
                  left,
                  width: 210,
                  maxHeight: 'min(280px, calc(100vh - 110px))',
                  overflowY: 'auto',
                  padding: 6,
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  zIndex: 70,
                  transformOrigin: 'top left',
                }}
              >
                <button
                  type="button"
                  className="btn"
                  style={{ width: '100%', border: 'none', justifyContent: 'flex-start', fontSize: 12, padding: '6px 8px' }}
                  onClick={() => {
                    setAddMenuOpen(false);
                    openNewCanvasModal();
                  }}
                >
                  <Plus size={13} />
                  <span>New Canvas…</span>
                </button>
                {hiddenCanvases.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '2px 4px' }} />
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', padding: '3px 8px 2px' }}>
                      Open Existing
                    </div>
                    {hiddenCanvases.map(({ c, idx }) => (
                      <button
                        key={c.id}
                        type="button"
                        className="btn"
                        style={{
                          width: '100%',
                          border: 'none',
                          justifyContent: 'space-between',
                          fontSize: 12,
                          padding: '5px 8px',
                        }}
                        onClick={() => {
                          onOpenCanvasTab(c.id);
                          onSelectCanvas(idx);
                          setAddMenuOpen(false);
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </span>
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                          {c.width}×{c.height}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>
      </div>

      {showNewModal && (
        <div className="modal-backdrop" onClick={() => setShowNewModal(false)}>
          <div
            ref={newDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-tab-canvas-title"
            className="floating-card"
            style={{
              width: 'min(340px, calc(100vw - 24px))',
              padding: 18,
              background: 'var(--surface)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="new-tab-canvas-title" style={{ margin: '0 0 12px', fontSize: 15 }}>
              New Canvas Tab
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Canvas Name
                </div>
                <input
                  autoFocus
                  aria-label="Canvas Name"
                  className="field-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="new-tab-size-preset"
                  style={{ display: 'block', fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}
                >
                  Size Preset
                </label>
                <select
                  id="new-tab-size-preset"
                  className="field-input mono"
                  value={
                    PRESETS.some((sz) => newW === String(sz) && newH === String(sz))
                      ? `${newW}x${newH}`
                      : 'custom'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') return;
                    const [w, h] = val.split('x');
                    if (w && h) {
                      setNewW(w);
                      setNewH(h);
                      setNewErr(null);
                    }
                  }}
                >
                  {PRESETS.map((sz) => (
                    <option key={sz} value={`${sz}x${sz}`}>
                      {sz} × {sz}
                    </option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 3 }}>
                    Width
                  </div>
                  <input
                    type="number"
                    aria-label="Canvas width"
                    min={4}
                    max={512}
                    className="field-input mono"
                    value={newW}
                    onChange={(e) => setNewW(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 3 }}>
                    Height
                  </div>
                  <input
                    type="number"
                    aria-label="Canvas height"
                    min={4}
                    max={512}
                    className="field-input mono"
                    value={newH}
                    onChange={(e) => setNewH(e.target.value)}
                  />
                </div>
              </div>
              {newErr && (
                <div role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>
                  {newErr}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn" onClick={() => setShowNewModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn primary" onClick={handleCreate}>
                  Add Canvas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteIdx !== null && canvases[confirmDeleteIdx] && (
        <div className="modal-backdrop" onClick={() => setConfirmDeleteIdx(null)}>
          <div
            ref={delDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-tab-canvas-title"
            className="floating-card"
            style={{
              width: 'min(320px, calc(100vw - 24px))',
              padding: 18,
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-tab-canvas-title" style={{ margin: 0, fontSize: 15 }}>
              Delete Canvas Permanently?
            </h3>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Permanently delete &ldquo;{canvases[confirmDeleteIdx].name}&rdquo; (
              {canvases[confirmDeleteIdx].width}×{canvases[confirmDeleteIdx].height}) from this
              project?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setConfirmDeleteIdx(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  onDeleteCanvas(confirmDeleteIdx);
                  setConfirmDeleteIdx(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
