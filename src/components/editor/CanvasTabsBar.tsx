import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Files,
  Folder,
  FolderInput,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { CanvasDoc, CanvasFolder } from '../../engine/types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const PRESETS = [16, 32, 64, 128];

export function CanvasTabsBar({
  canvases,
  folders = [],
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
  onCreateFolder,
  onRenameFolder,
  onToggleFolder,
  onDeleteFolder,
  onExportFolder,
  onMoveFolder,
  onMoveCanvasToFolder,
  onCollapsedHudLeftChange,
}: {
  canvases: CanvasDoc[];
  folders?: CanvasFolder[];
  activeCanvasIndex: number;
  openCanvasIds: string[];
  open?: boolean;
  onToggleOpen?: () => void;
  onSelectCanvas: (idx: number) => void;
  onHideCanvasTab: (id: string) => void;
  onOpenCanvasTab: (id: string) => void;
  onAddCanvas: (name: string, width: number, height: number, folderId?: string | null) => void;
  onRenameCanvas: (idx: number, name: string) => void;
  onReorderCanvas?: (fromIdx: number, toIdx: number) => void;
  onDeleteCanvas: (idx: number) => void;
  onCreateFolder?: (name: string, parentId?: string | null) => string;
  onRenameFolder?: (folderId: string, name: string) => void;
  onToggleFolder?: (folderId: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onExportFolder?: (folderId: string) => void;
  onMoveFolder?: (folderId: string, parentId: string | null) => void;
  onMoveCanvasToFolder?: (canvasId: string, folderId: string | null) => void;
  onCollapsedHudLeftChange?: (leftPx: number) => void;
}) {
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameDraft, setFolderRenameDraft] = useState('');
  const [movingCanvasId, setMovingCanvasId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folderCtxMenu, setFolderCtxMenu] = useState<{
    folder: CanvasFolder;
    x: number;
    y: number;
  } | null>(null);
  const [dragItem, setDragItem] = useState<{ kind: 'canvas' | 'folder'; id: string } | null>(null);
  const [dropFolderTarget, setDropFolderTarget] = useState<string | 'root' | null>(null);
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
  const folderCtxRef = useRef<HTMLDivElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const newDialogRef = useRef<HTMLDivElement | null>(null);
  const delDialogRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(() => setExplorerOpen(false), explorerOpen);
  useEscapeKey(() => setFolderCtxMenu(null), folderCtxMenu !== null);
  useEscapeKey(() => setAddMenuOpen(false), addMenuOpen);
  useEscapeKey(() => setShowNewModal(false), showNewModal);
  useEscapeKey(() => setConfirmDeleteIdx(null), confirmDeleteIdx !== null);
  useFocusTrap(newDialogRef, showNewModal);
  useFocusTrap(delDialogRef, confirmDeleteIdx !== null);

  useEffect(() => {
    if (!explorerOpen) {
      setFolderCtxMenu(null);
      return;
    }
    const onDown = (e: PointerEvent) => {
      if (
        explorerRef.current &&
        !explorerRef.current.contains(e.target as Node) &&
        (!folderCtxRef.current || !folderCtxRef.current.contains(e.target as Node))
      ) {
        setExplorerOpen(false);
        setFolderCtxMenu(null);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [explorerOpen]);

  useEffect(() => {
    if (!folderCtxMenu) return;
    const onDown = (e: PointerEvent) => {
      if (folderCtxRef.current && !folderCtxRef.current.contains(e.target as Node)) {
        setFolderCtxMenu(null);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [folderCtxMenu]);

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
    const targetFolder =
      activeFolderId && folders.some((f) => f.id === activeFolderId) ? activeFolderId : null;
    onAddCanvas(newName.trim() || `Canvas ${canvases.length + 1}`, w, h, targetFolder);
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
            const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 280)) : 8;
            const folderIdSet = new Set(folders.map((f) => f.id));
            const rootCanvases = canvases
              .map((c, idx) => ({ c, idx }))
              .filter(({ c }) => !c.folderId || !folderIdSet.has(c.folderId));
            const rootFolders = folders.filter((f) => !f.parentId || !folderIdSet.has(f.parentId));

            const canDropIntoFolder = (targetFolderId: string): boolean => {
              if (!dragItem) return false;
              if (dragItem.kind === 'canvas') return Boolean(onMoveCanvasToFolder);
              if (!onMoveFolder) return false;
              let cur: string | null | undefined = targetFolderId;
              const visited = new Set<string>();
              while (cur) {
                if (cur === dragItem.id) return false;
                if (visited.has(cur)) break;
                visited.add(cur);
                cur = folders.find((f) => f.id === cur)?.parentId ?? null;
              }
              return true;
            };

            const handleDropOnTarget = (targetFolderId: string | null) => {
              if (!dragItem) return;
              if (dragItem.kind === 'canvas') {
                onMoveCanvasToFolder?.(dragItem.id, targetFolderId);
              } else if (targetFolderId === null || canDropIntoFolder(targetFolderId)) {
                onMoveFolder?.(dragItem.id, targetFolderId);
              }
              setDragItem(null);
              setDropFolderTarget(null);
            };

            const renderCanvasRow = (c: CanvasDoc, idx: number, depth: number) => {
              const isActive = idx === activeCanvasIndex;
              const isOpen = openCanvasIds.includes(c.id);
              const isMoving = movingCanvasId === c.id;
              const indentPx = Math.min(depth, 4) * 12;
              return (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div
                    draggable={renamingIdx !== idx && Boolean(onMoveCanvasToFolder)}
                    onDragStart={(e) => {
                      setDragItem({ kind: 'canvas', id: c.id });
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', c.id);
                    }}
                    onDragEnd={() => {
                      setDragItem(null);
                      setDropFolderTarget(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      marginLeft: indentPx,
                      padding: '4px 6px',
                      borderRadius: 7,
                      background: isActive ? 'var(--accent-container)' : 'var(--surface-elevated)',
                      border: isActive
                        ? '1px solid color-mix(in srgb, var(--accent) 45%, transparent)'
                        : '1px solid transparent',
                      opacity: dragItem?.kind === 'canvas' && dragItem.id === c.id ? 0.55 : 1,
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
                          <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
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
                                flexShrink: 0,
                              }}
                            >
                              hidden
                            </span>
                          )}
                        </button>

                        {onMoveCanvasToFolder && folders.length > 0 && (
                          <button
                            type="button"
                            className={`icon-btn ${isMoving ? 'active' : ''}`}
                            style={{ width: 24, height: 24 }}
                            aria-label={`Move ${c.name} to folder`}
                            aria-expanded={isMoving}
                            title="Move to folder"
                            onClick={() => setMovingCanvasId((cur) => (cur === c.id ? null : c.id))}
                          >
                            <FolderInput size={12} />
                          </button>
                        )}

                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: 24, height: 24 }}
                          aria-label={`Rename ${c.name}`}
                          title="Rename"
                          onClick={() => {
                            setRenameDraft(c.name);
                            setRenamingIdx(idx);
                          }}
                        >
                          <Pencil size={12} />
                        </button>

                        {canvases.length > 1 && (
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: 24, height: 24, color: 'var(--danger)' }}
                            aria-label={`Delete ${c.name}`}
                            title="Delete permanently"
                            onClick={() => {
                              setExplorerOpen(false);
                              setConfirmDeleteIdx(idx);
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {isMoving && onMoveCanvasToFolder && (
                    <div
                      style={{
                        marginLeft: indentPx + 6,
                        padding: 4,
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--surface-elevated)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 4,
                      }}
                    >
                      <button
                        type="button"
                        className={`btn ${!c.folderId ? 'primary' : ''}`}
                        style={{ padding: '2px 7px', fontSize: 11 }}
                        onClick={() => {
                          onMoveCanvasToFolder(c.id, null);
                          setMovingCanvasId(null);
                        }}
                      >
                        Root
                      </button>
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`btn ${c.folderId === f.id ? 'primary' : ''}`}
                          style={{ padding: '2px 7px', fontSize: 11 }}
                          onClick={() => {
                            onMoveCanvasToFolder(c.id, f.id);
                            setMovingCanvasId(null);
                          }}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            };

            const renderFolderTree = (folder: CanvasFolder, depth: number): React.ReactNode => {
              const childFolders = folders.filter((f) => f.parentId === folder.id);
              const members = canvases
                .map((c, idx) => ({ c, idx }))
                .filter(({ c }) => c.folderId === folder.id);
              const isDropHere = dropFolderTarget === folder.id;
              const indentPx = Math.min(depth, 4) * 12;
              return (
                <div key={folder.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div
                    draggable={renamingFolderId !== folder.id && Boolean(onMoveFolder)}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setDragItem({ kind: 'folder', id: folder.id });
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', folder.id);
                    }}
                    onDragEnd={() => {
                      setDragItem(null);
                      setDropFolderTarget(null);
                    }}
                    onDragOver={(e) => {
                      if (!canDropIntoFolder(folder.id)) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      if (dropFolderTarget !== folder.id) setDropFolderTarget(folder.id);
                    }}
                    onDragLeave={() => {
                      if (dropFolderTarget === folder.id) setDropFolderTarget(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDropOnTarget(folder.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setFolderCtxMenu({ folder, x: e.clientX, y: e.clientY });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      marginLeft: indentPx,
                      padding: '3px 6px',
                      borderRadius: 7,
                      border: isDropHere
                        ? '1px dashed var(--accent)'
                        : activeFolderId === folder.id
                          ? '1px solid color-mix(in srgb, var(--accent) 55%, transparent)'
                          : '1px solid transparent',
                      background: isDropHere || activeFolderId === folder.id
                        ? 'var(--accent-container)'
                        : 'color-mix(in srgb, var(--text-muted) 8%, transparent)',
                      opacity: dragItem?.kind === 'folder' && dragItem.id === folder.id ? 0.55 : 1,
                    }}
                  >
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: 20, height: 20 }}
                      aria-label={folder.collapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
                      onClick={() => onToggleFolder?.(folder.id)}
                    >
                      {folder.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <Folder size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    {renamingFolderId === folder.id ? (
                      <form
                        style={{ flex: 1, minWidth: 0 }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmed = folderRenameDraft.trim();
                          if (trimmed) onRenameFolder?.(folder.id, trimmed);
                          setRenamingFolderId(null);
                        }}
                      >
                        <input
                          autoFocus
                          aria-label="Folder name"
                          value={folderRenameDraft}
                          onChange={(e) => setFolderRenameDraft(e.target.value)}
                          onBlur={() => {
                            const trimmed = folderRenameDraft.trim();
                            if (trimmed) onRenameFolder?.(folder.id, trimmed);
                            setRenamingFolderId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.stopPropagation();
                              setRenamingFolderId(null);
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
                            setActiveFolderId((cur) => (cur === folder.id ? null : folder.id));
                            onToggleFolder?.(folder.id);
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
                            gap: 5,
                            color: activeFolderId === folder.id ? 'var(--accent)' : 'var(--text-primary)',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {folder.name}
                          </span>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {members.length + childFolders.length}
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                  {!folder.collapsed && (
                    <>
                      {childFolders.map((sub) => renderFolderTree(sub, depth + 1))}
                      {members.map(({ c, idx }) => renderCanvasRow(c, idx, depth + 1))}
                    </>
                  )}
                </div>
              );
            };

            return (
              <div
                className="floating-card menu-pop"
                style={{
                  position: 'fixed',
                  top,
                  left,
                  width: 284,
                  maxHeight: 'min(390px, calc(100vh - 110px))',
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
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginRight: 'auto' }}>
                    Project Canvases ({canvases.length})
                  </span>
                  {onCreateFolder && (
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: 24, height: 24 }}
                      aria-label={activeFolderId ? 'New subfolder in active folder' : 'New folder'}
                      title={activeFolderId ? 'New Subfolder in Active Folder' : 'New Folder'}
                      onClick={() => {
                        const targetParent =
                          activeFolderId && folders.some((f) => f.id === activeFolderId)
                            ? activeFolderId
                            : null;
                        if (targetParent) {
                          const parent = folders.find((f) => f.id === targetParent);
                          if (parent?.collapsed) onToggleFolder?.(targetParent);
                        }
                        const countInParent = folders.filter(
                          (f) => (f.parentId ?? null) === targetParent
                        ).length;
                        const label = targetParent
                          ? `Subfolder ${countInParent + 1}`
                          : `Folder ${countInParent + 1}`;
                        const newId = onCreateFolder(label, targetParent);
                        setFolderRenameDraft(label);
                        setRenamingFolderId(newId);
                      }}
                    >
                      <FolderPlus size={14} />
                    </button>
                  )}
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

                {rootFolders.map((folder) => renderFolderTree(folder, 0))}

                <div
                  onDragOver={(e) => {
                    if (!dragItem || folders.length === 0) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dropFolderTarget !== 'root') setDropFolderTarget('root');
                  }}
                  onDragLeave={() => {
                    if (dropFolderTarget === 'root') setDropFolderTarget(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnTarget(null);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: dropFolderTarget === 'root' ? 4 : 0,
                    borderRadius: 7,
                    border: dropFolderTarget === 'root' ? '1px dashed var(--accent)' : 'none',
                    minHeight: folders.length > 0 && rootCanvases.length === 0 ? 22 : undefined,
                  }}
                >
                  {rootCanvases.map(({ c, idx }) => renderCanvasRow(c, idx, 0))}
                </div>
              </div>
            );
          })()}

          {folderCtxMenu && (
            <div
              ref={folderCtxRef}
              role="menu"
              aria-label={`Actions for folder ${folderCtxMenu.folder.name}`}
              className="floating-card menu-pop"
              style={{
                position: 'fixed',
                top: Math.min(folderCtxMenu.y, window.innerHeight - 160),
                left: Math.min(folderCtxMenu.x, window.innerWidth - 180),
                width: 170,
                padding: 5,
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                zIndex: 80,
                transformOrigin: 'top left',
              }}
            >
              {onCreateFolder && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12, padding: '5px 8px' }}
                  onClick={() => {
                    const target = folderCtxMenu.folder;
                    if (target.collapsed) onToggleFolder?.(target.id);
                    const subCount = folders.filter((f) => f.parentId === target.id).length;
                    const subName = `Subfolder ${subCount + 1}`;
                    const newId = onCreateFolder(subName, target.id);
                    setFolderRenameDraft(subName);
                    setRenamingFolderId(newId);
                    setFolderCtxMenu(null);
                  }}
                >
                  <FolderPlus size={13} />
                  <span>New Subfolder</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12, padding: '5px 8px' }}
                onClick={() => {
                  setActiveFolderId(folderCtxMenu.folder.id);
                  setFolderCtxMenu(null);
                  openNewCanvasModal();
                }}
              >
                <Plus size={13} />
                <span>New Canvas Here</span>
              </button>
              {onExportFolder && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12, padding: '5px 8px' }}
                  onClick={() => {
                    const id = folderCtxMenu.folder.id;
                    setFolderCtxMenu(null);
                    onExportFolder(id);
                  }}
                >
                  <Download size={13} />
                  <span>Export Folder…</span>
                </button>
              )}
              {onRenameFolder && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12, padding: '5px 8px' }}
                  onClick={() => {
                    setFolderRenameDraft(folderCtxMenu.folder.name);
                    setRenamingFolderId(folderCtxMenu.folder.id);
                    setFolderCtxMenu(null);
                  }}
                >
                  <Pencil size={13} />
                  <span>Rename</span>
                </button>
              )}
              {onDeleteFolder && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{
                    border: 'none',
                    justifyContent: 'flex-start',
                    fontSize: 12,
                    padding: '5px 8px',
                    color: 'var(--danger)',
                  }}
                  onClick={() => {
                    const id = folderCtxMenu.folder.id;
                    if (activeFolderId === id) setActiveFolderId(null);
                    onDeleteFolder(id);
                    setFolderCtxMenu(null);
                  }}
                >
                  <Trash2 size={13} />
                  <span>Delete Folder</span>
                </button>
              )}
            </div>
          )}
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
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  className="field-select mono"
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
                    onChange={(e) => {
                      setNewW(e.target.value);
                      if (newErr) setNewErr(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                    }}
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
                    onChange={(e) => {
                      setNewH(e.target.value);
                      if (newErr) setNewErr(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                    }}
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
