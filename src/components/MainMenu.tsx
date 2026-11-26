import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  ImagePlus,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { createNewProject } from '../engine/pixelEngine';
import { importProjectFromFile } from '../engine/importer';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  deleteProject,
  loadAllProjects,
  renderCompositeToCanvas,
  saveProject,
} from '../engine/storage';
import { PixelProject } from '../engine/types';

const QUICK_TEMPLATES: Array<{ label: string; size: number }> = [
  { label: '16×16 Item', size: 16 },
  { label: '32×32 Character', size: 32 },
  { label: '64×64 Portrait', size: 64 },
  { label: '128×128 Scene', size: 128 },
  { label: '256×256 Tileset', size: 256 },
];

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString();
}

function ProjectThumb({ project }: { project: PixelProject }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      renderCompositeToCanvas(project, ref.current);
    }
  }, [project]);

  return (
    <canvas
      ref={ref}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        imageRendering: 'pixelated',
      }}
    />
  );
}

export function MainMenu({
  theme,
  onToggleTheme,
  onOpenProject,
}: {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenProject: (p: PixelProject) => void;
}) {
  const [projects, setProjects] = useState<PixelProject[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('Untitled Sprite');
  const [width, setWidth] = useState('32');
  const [height, setHeight] = useState('32');
  const [err, setErr] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PixelProject | null>(null);

  const [query, setQuery] = useState('');
  const [sizeFilter, setSizeFilter] = useState<'all' | 'small' | 'medium' | 'large'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'size'>('recent');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const newDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(newDialogRef, showNew);
  useFocusTrap(deleteDialogRef, Boolean(confirmDelete));
  useEscapeKey(() => setOpenMenuId(null), Boolean(openMenuId));

  useEffect(() => {
    if (!openMenuId) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-card-menu="true"]')) {
        setOpenMenuId(null);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [openMenuId]);

  const refresh = async () => {
    try {
      const list = await loadAllProjects();
      setProjects(list);
    } catch {
      setImportErr('Could not load saved sprites from browser storage.');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!showNew && !confirmDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNew(false);
        setConfirmDelete(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showNew, confirmDelete]);

  const handleCreate = async () => {
    const w = parseInt(width, 10);
    const h = parseInt(height, 10);
    if (isNaN(w) || isNaN(h) || w < 4 || h < 4 || w > 1024 || h > 1024) {
      setErr('Enter width and height between 4 and 1024.');
      return;
    }
    const proj = createNewProject(name.trim() || `Sprite ${w}x${h}`, w, h);
    await saveProject(proj);
    setShowNew(false);
    onOpenProject(proj);
  };

  const handleQuickTemplate = async (label: string, size: number) => {
    const proj = createNewProject(label, size, size);
    await saveProject(proj);
    onOpenProject(proj);
  };

  const handleImportFile = async (file: File) => {
    setImportErr(null);
    try {
      const proj = await importProjectFromFile(file);
      await saveProject(proj);
      onOpenProject(proj);
    } catch (err) {
      setImportErr(
        err instanceof Error ? err.message : 'Failed to import selected file.'
      );
    }
  };

  const handleDuplicate = async (p: PixelProject) => {
    const copy: PixelProject = {
      ...p,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: `${p.name} Copy`,
      layers: p.layers.map((l) => ({ ...l, pixels: new Uint32Array(l.pixels) })),
      groups: p.groups.map((g) => ({ ...g })),
      updatedAt: Date.now(),
    };
    await saveProject(copy);
    refresh();
  };

  const commitRename = async (p: PixelProject) => {
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === p.name) return;
    await saveProject({ ...p, name: trimmed, updatedAt: Date.now() });
    refresh();
  };

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      const maxDim = Math.max(p.width, p.height);
      if (sizeFilter === 'small' && maxDim > 32) return false;
      if (sizeFilter === 'medium' && (maxDim <= 32 || maxDim > 64)) return false;
      if (sizeFilter === 'large' && maxDim <= 64) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return b.width * b.height - a.width * a.height;
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [projects, query, sizeFilter, sortBy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header
        style={{
          height: 56,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 20px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', flex: 1 }}>
          ArtoPixel
        </h1>
        <button
          type="button"
          className="btn"
          onClick={() => importInputRef.current?.click()}
          title="Import a .apxl, PNG, or .ase / .aseprite file (up to 1024×1024)"
        >
          <ImagePlus size={15} /> Import .apxl / PNG / ASE
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="image/png,image/*,.apxl,.ase,.aseprite"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) handleImportFile(f);
          }}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
      </header>

      <main
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDraggingFile) setIsDraggingFile(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setIsDraggingFile(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFile(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleImportFile(f);
        }}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 20,
          maxWidth: 980,
          width: '100%',
          margin: '0 auto',
          outline: isDraggingFile ? '2px dashed var(--accent)' : 'none',
          outlineOffset: -8,
        }}
      >
        {importErr && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '8px 12px',
              marginBottom: 14,
              borderRadius: 10,
              border: '1px solid var(--danger)',
              background: 'color-mix(in srgb, var(--danger) 12%, var(--surface))',
              color: 'var(--danger)',
              fontSize: 13,
            }}
          >
            <span>{importErr}</span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 26, height: 26, color: 'var(--danger)' }}
              aria-label="Dismiss error"
              onClick={() => setImportErr(null)}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Quick-Start Game Dev Templates */}
        <section aria-label="Quick start templates" style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginRight: 4,
              }}
            >
              Quick Start:
            </span>
            {QUICK_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                className="btn"
                style={{ fontSize: 12, padding: '5px 10px' }}
                onClick={() => handleQuickTemplate(tpl.label, tpl.size)}
              >
                {tpl.label}
              </button>
            ))}
          </div>
        </section>

        {/* Search, Filter & Sort (shown when projects exist) */}
        {projects.length > 0 ? (
          <section
            aria-label="Filter and sort sprites"
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 14,
              alignItems: 'center',
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                aria-label="Search sprites"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sprites..."
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                }}
              />
            </div>
            <select
              aria-label="Filter by canvas size"
              value={sizeFilter}
              onChange={(e) =>
                setSizeFilter(e.target.value as 'all' | 'small' | 'medium' | 'large')
              }
              style={{
                padding: '7px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <option value="all">All Sizes</option>
              <option value="small">≤ 32×32</option>
              <option value="medium">33–64px</option>
              <option value="large">≥ 65px</option>
            </select>
            <select
              aria-label="Sort sprites"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'recent' | 'name' | 'size')}
              style={{
                padding: '7px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <option value="recent">Last Edited</option>
              <option value="name">Name (A–Z)</option>
              <option value="size">Largest Canvas</option>
            </select>
          </section>
        ) : (
          <p
            style={{
              margin: '0 0 14px',
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            Your studio is empty — pick a Quick Start size, create a custom canvas, or drop a PNG / .aseprite file.
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
            gap: 14,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setErr(null);
              setShowNew(true);
            }}
            style={{
              aspectRatio: '0.88',
              borderRadius: 14,
              border: '2px dashed var(--text-muted)',
              background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
              color: 'var(--text-primary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              cursor: 'pointer',
            }}
          >
            <Plus size={34} color="var(--accent)" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>New Canvas</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              or drop PNG / .aseprite
            </span>
          </button>

          {projects.length > 0 && filteredProjects.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                borderRadius: 14,
                border: '1px dashed var(--border)',
                background: 'var(--surface)',
                padding: '28px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                No matching sprites
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                No sprites match your current search or size filter.
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setQuery('');
                  setSizeFilter('all');
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {filteredProjects.map((p) => {
            const frameCount = p.frames?.length ?? 1;
            const canvasCount = p.canvases?.length ?? 1;
            const menuOpen = openMenuId === p.id;
            return (
              <div
                key={p.id}
                className="project-card"
                style={{
                  aspectRatio: '0.88',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                <div
                  className="project-card-checker"
                  style={{
                    flex: 1,
                    position: 'relative',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Open ${p.name} (${p.width} by ${p.height})`}
                    onClick={() => onOpenProject(p)}
                    style={{
                      width: '100%',
                      height: '100%',
                      background: 'transparent',
                      border: 'none',
                      padding: 10,
                      cursor: 'pointer',
                      display: 'block',
                    }}
                  >
                    <ProjectThumb project={p} />
                  </button>

                  <span
                    className="mono"
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      pointerEvents: 'none',
                      padding: '2px 6px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {canvasCount > 1
                      ? `${canvasCount} canvases`
                      : `${p.width}×${p.height}${frameCount > 1 ? ` · ${frameCount}F` : ''}`}
                  </span>

                  <div
                    data-card-menu="true"
                    style={{ position: 'absolute', top: 5, right: 5 }}
                  >
                    <button
                      type="button"
                      className="icon-btn project-card-more"
                      style={{
                        width: 28,
                        height: 28,
                        background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
                        borderColor: menuOpen ? 'var(--accent)' : 'var(--border)',
                      }}
                      aria-label={`Actions for ${p.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      title="Actions"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId((cur) => (cur === p.id ? null : p.id));
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </button>

                    {menuOpen && (
                      <div
                        role="menu"
                        className="floating-card menu-pop"
                        style={{
                          position: 'absolute',
                          top: 32,
                          right: 0,
                          width: 148,
                          padding: 5,
                          background: 'var(--surface-elevated)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          zIndex: 40,
                          transformOrigin: 'top right',
                        }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="btn"
                          style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
                          onClick={() => {
                            setOpenMenuId(null);
                            setRenameDraft(p.name);
                            setRenamingId(p.id);
                          }}
                        >
                          <Pencil size={13} /> Rename
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="btn"
                          style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
                          onClick={() => {
                            setOpenMenuId(null);
                            handleDuplicate(p);
                          }}
                        >
                          <Copy size={13} /> Duplicate
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
                            setOpenMenuId(null);
                            setConfirmDelete(p);
                          }}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 8, minWidth: 0 }}>
                  {renamingId === p.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitRename(p);
                      }}
                      style={{ display: 'flex', gap: 4, marginBottom: 4 }}
                    >
                      <input
                        autoFocus
                        aria-label="Sprite name"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => commitRename(p)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '3px 6px',
                          borderRadius: 6,
                          border: '1px solid var(--accent)',
                          background: 'var(--surface-elevated)',
                          color: 'var(--text-primary)',
                          fontSize: 12.5,
                        }}
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenProject(p)}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        textAlign: 'left',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {p.name}
                      </div>
                    </button>
                  )}

                  <div
                    className="mono"
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.layers.length} {p.layers.length === 1 ? 'layer' : 'layers'} •{' '}
                    {formatRelativeTime(p.updatedAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div
            ref={newDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-canvas-title"
            className="floating-card"
            style={{
              width: 'min(340px, calc(100vw - 24px))',
              padding: 20,
              background: 'var(--surface)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="new-canvas-title" style={{ margin: '0 0 14px' }}>
              New Canvas
            </h3>
            <label
              htmlFor="new-project-name"
              style={{ fontSize: 12, color: 'var(--text-secondary)' }}
            >
              Project Name
            </label>
            <input
              id="new-project-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                marginTop: 4,
                marginBottom: 12,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-elevated)',
                color: 'var(--text-primary)',
              }}
            />
            <label
              htmlFor="new-canvas-preset"
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 4,
              }}
            >
              Preset Size
            </label>
            <select
              id="new-canvas-preset"
              value={
                width === height &&
                ['16', '32', '48', '64', '128', '256', '512', '1024'].includes(width)
                  ? width
                  : 'custom'
              }
              onChange={(e) => {
                if (e.target.value !== 'custom') {
                  setWidth(e.target.value);
                  setHeight(e.target.value);
                  setErr(null);
                }
              }}
              style={{
                width: '100%',
                marginBottom: 12,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-elevated)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <option value="custom">Custom</option>
              {[16, 32, 48, 64, 128, 256, 512, 1024].map((s) => (
                <option key={s} value={String(s)}>
                  {s} × {s}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                aria-label="Canvas width"
                min={4}
                max={1024}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="Width"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-elevated)',
                  color: 'var(--text-primary)',
                }}
              />
              <span aria-hidden="true">×</span>
              <input
                type="number"
                aria-label="Canvas height"
                min={4}
                max={1024}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="Height"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-elevated)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            {err && (
              <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>
                {err}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 18,
              }}
            >
              <button type="button" className="btn" onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleCreate}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-canvas-title"
            className="floating-card"
            style={{
              width: 'min(320px, calc(100vw - 24px))',
              padding: 20,
              background: 'var(--surface)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-canvas-title" style={{ margin: '0 0 8px' }}>
              Delete Canvas?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              Permanently delete "{confirmDelete.name}" ({confirmDelete.width}×
              {confirmDelete.height})?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={async () => {
                  await deleteProject(confirmDelete.id);
                  setConfirmDelete(null);
                  refresh();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
