import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  ImagePlus,
  Moon,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { createNewProject } from '../engine/pixelEngine';
import { parseAsepriteBuffer } from '../engine/asepriteParser';
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

  const importInputRef = useRef<HTMLInputElement | null>(null);

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
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.ase') || lower.endsWith('.aseprite')) {
      try {
        const buf = await file.arrayBuffer();
        const baseName = file.name.replace(/\.(ase|aseprite)$/i, '') || 'Aseprite Sprite';
        const { project } = await parseAsepriteBuffer(buf, baseName);
        await saveProject(project);
        onOpenProject(project);
      } catch (err) {
        setImportErr(
          err instanceof Error ? err.message : 'Failed to parse Aseprite file.'
        );
      }
      return;
    }

    if (!file.type.startsWith('image/')) {
      setImportErr('Please choose a PNG, .ase, or .aseprite file.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w < 4 || h < 4 || w > 1024 || h > 1024) {
        setImportErr(
          `Image must be between 4×4 and 1024×1024 pixels (got ${w}×${h}).`
        );
        return;
      }
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const baseName = file.name.replace(/\.[^.]+$/, '') || `Sprite ${w}x${h}`;
      const proj = createNewProject(baseName, w, h);
      const px = proj.layers[0].pixels;
      for (let i = 0; i < w * h; i++) {
        const off4 = i * 4;
        const r = data[off4];
        const g = data[off4 + 1];
        const b = data[off4 + 2];
        const a = data[off4 + 3];
        px[i] = a === 0 ? 0 : (((a << 24) | (r << 16) | (g << 8) | b) >>> 0);
      }
      await saveProject(proj);
      onOpenProject(proj);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setImportErr('Could not decode the selected image file.');
    };
    img.src = url;
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
          title="Import a PNG or .ase / .aseprite file (up to 1024×1024)"
        >
          <ImagePlus size={15} /> Import PNG / ASE
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="image/png,image/*,.ase,.aseprite"
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

          {filteredProjects.map((p) => (
            <div
              key={p.id}
              style={{
                aspectRatio: '0.88',
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <button
                type="button"
                aria-label={`Open ${p.name} (${p.width} by ${p.height})`}
                onClick={() => onOpenProject(p)}
                style={{
                  flex: 1,
                  background: 'var(--checker-dark)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 8,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  display: 'block',
                  width: '100%',
                }}
              >
                <ProjectThumb project={p} />
              </button>

              <div style={{ marginTop: 8 }}>
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginTop: 2,
                    gap: 2,
                  }}
                >
                  <div
                    className="mono"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 10.5,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.width}×{p.height} • {p.layers.length}L •{' '}
                    {formatRelativeTime(p.updatedAt)}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 30, height: 30 }}
                    aria-label={`Rename ${p.name}`}
                    title="Rename"
                    onClick={() => {
                      setRenameDraft(p.name);
                      setRenamingId(p.id);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 30, height: 30 }}
                    aria-label={`Duplicate ${p.name}`}
                    title="Duplicate"
                    onClick={() => handleDuplicate(p)}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 30, height: 30, color: 'var(--danger)' }}
                    aria-label={`Delete ${p.name}`}
                    title="Delete"
                    onClick={() => setConfirmDelete(p)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div
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
