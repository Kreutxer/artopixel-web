import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Circle,
  Download,
  FlipHorizontal,
  FlipVertical,
  Grid2x2,
  Grid3x3,
  Home,
  ImagePlus,
  Loader2,
  Menu,
  Moon,
  Square,
  Sun,
} from 'lucide-react';
import { BrushShape, MirrorMode, PixelTool } from '../../engine/types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { ColorPanel } from '../ColorPanel';
import { GridMode } from './drawViewport';

export interface EditorHeaderProps {
  projectName: string;
  onRenameProject: (name: string) => void;
  saveStatus: 'saved' | 'saving' | 'error';
  onSaveProject: () => void;
  onBack: () => void;
  onImportFile: (file: File, mode: 'place' | 'open') => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenResize: () => void;
  tiledMode: boolean;
  onToggleTiledMode: () => void;
  brushShape: BrushShape;
  onToggleBrushShape: () => void;
  brushSize: number;
  onChangeBrushSize: (size: number) => void;
  onPreviewingSizeChange: (previewing: boolean) => void;
  gridMode: GridMode;
  onChangeGridMode: (mode: GridMode | ((cur: GridMode) => GridMode)) => void;
  mirror: MirrorMode;
  onChangeMirror: (mode: MirrorMode | ((cur: MirrorMode) => MirrorMode)) => void;
  activeColor: number;
  palette: number[];
  tool: PixelTool;
  onToggleEyedropper: () => void;
  onSelectColor: (c: number) => void;
  onSetPalette: (cols: number[]) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenExport: () => void;
}

export function EditorHeader({
  projectName,
  onRenameProject,
  saveStatus,
  onSaveProject,
  onBack,
  onImportFile,
  onOpenSettings,
  onOpenShortcuts,
  onOpenResize,
  tiledMode,
  onToggleTiledMode,
  brushShape,
  onToggleBrushShape,
  brushSize,
  onChangeBrushSize,
  onPreviewingSizeChange,
  gridMode,
  onChangeGridMode,
  mirror,
  onChangeMirror,
  activeColor,
  palette,
  tool,
  onToggleEyedropper,
  onSelectColor,
  onSetPalette,
  theme,
  onToggleTheme,
  onOpenExport,
}: EditorHeaderProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [importSubOpen, setImportSubOpen] = useState(false);
  const [optionsSubOpen, setOptionsSubOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingBrushSize, setEditingBrushSize] = useState(false);
  const [brushSizeDraft, setBrushSizeDraft] = useState(String(brushSize));
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const [lastGridMode, setLastGridMode] = useState<Exclude<GridMode, 'off'>>('tile');
  const [mirrorMenuOpen, setMirrorMenuOpen] = useState(false);
  const [lastMirrorMode, setLastMirrorMode] = useState<Exclude<MirrorMode, 'none'>>('horizontal');

  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const gridMenuRef = useRef<HTMLDivElement | null>(null);
  const mirrorMenuRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importModeRef = useRef<'place' | 'open'>('place');

  useEscapeKey(() => setShowMoreMenu(false), showMoreMenu);
  useEscapeKey(() => setGridMenuOpen(false), gridMenuOpen);
  useEscapeKey(() => setMirrorMenuOpen(false), mirrorMenuOpen);

  useEffect(() => {
    if (!showMoreMenu) return;
    const onDown = (e: PointerEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [showMoreMenu]);

  useEffect(() => {
    if (!gridMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (gridMenuRef.current && !gridMenuRef.current.contains(e.target as Node)) {
        setGridMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [gridMenuOpen]);

  useEffect(() => {
    if (!mirrorMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (mirrorMenuRef.current && !mirrorMenuRef.current.contains(e.target as Node)) {
        setMirrorMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [mirrorMenuOpen]);

  return (
    <header
      className="editor-header"
      style={{
        height: 54,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 10,
        position: 'relative',
        zIndex: 45,
      }}
    >
      <input
        ref={importInputRef}
        type="file"
        accept="image/*,.apxl,.ase,.aseprite"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f, importModeRef.current);
          e.target.value = '';
        }}
      />

      {/* Left: Menu + Project Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 0 }}>
        <div ref={moreMenuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Main menu"
            aria-expanded={showMoreMenu}
            aria-haspopup="menu"
            title="Menu"
            onClick={() => setShowMoreMenu((v) => !v)}
          >
            <Menu size={19} />
          </button>

          {showMoreMenu && (
            <div
              role="menu"
              className="floating-card menu-pop"
              style={{
                position: 'absolute',
                top: 44,
                left: 0,
                width: 220,
                padding: 6,
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                zIndex: 60,
                transformOrigin: 'top left',
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start' }}
                onClick={() => {
                  setShowMoreMenu(false);
                  onBack();
                }}
              >
                <Home size={14} /> Home
              </button>
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => setImportSubOpen(true)}
                onMouseLeave={() => setImportSubOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={importSubOpen}
                  className="btn"
                  style={{ width: '100%', border: 'none', justifyContent: 'space-between' }}
                  onClick={() => setImportSubOpen((v) => !v)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ImagePlus size={14} /> Import
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
                </button>
                {importSubOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      ...(typeof window !== 'undefined' && window.innerWidth < 400
                        ? { left: 0, top: '100%', paddingTop: 4 }
                        : { left: '100%', top: -4, paddingLeft: 4 }),
                      zIndex: 61,
                    }}
                  >
                    <div
                      role="menu"
                      className="floating-card menu-pop"
                      style={{
                        width: 176,
                        padding: 6,
                        background: 'var(--surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        transformOrigin: 'top left',
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="btn"
                        style={{ border: 'none', justifyContent: 'flex-start' }}
                        onClick={() => {
                          importModeRef.current = 'place';
                          setImportSubOpen(false);
                          setShowMoreMenu(false);
                          importInputRef.current?.click();
                        }}
                      >
                        Place into Canvas
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="btn"
                        style={{ border: 'none', justifyContent: 'flex-start' }}
                        onClick={() => {
                          importModeRef.current = 'open';
                          setImportSubOpen(false);
                          setShowMoreMenu(false);
                          importInputRef.current?.click();
                        }}
                      >
                        Import as New Tab
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'space-between' }}
                onClick={() => {
                  setShowMoreMenu(false);
                  onSaveProject();
                }}
              >
                <span>Save</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  Ctrl+S
                </span>
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => setOptionsSubOpen(true)}
                onMouseLeave={() => setOptionsSubOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={optionsSubOpen}
                  className="btn"
                  style={{ width: '100%', border: 'none', justifyContent: 'space-between' }}
                  onClick={() => setOptionsSubOpen((v) => !v)}
                >
                  <span>Settings</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
                </button>
                {optionsSubOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      ...(typeof window !== 'undefined' && window.innerWidth < 400
                        ? { left: 0, top: '100%', paddingTop: 4 }
                        : { left: '100%', top: -4, paddingLeft: 4 }),
                      zIndex: 61,
                    }}
                  >
                    <div
                      role="menu"
                      className="floating-card menu-pop"
                      style={{
                        width: 170,
                        padding: 6,
                        background: 'var(--surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        transformOrigin: 'top left',
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="btn"
                        style={{ border: 'none', justifyContent: 'flex-start' }}
                        onClick={() => {
                          setOptionsSubOpen(false);
                          setShowMoreMenu(false);
                          onOpenSettings();
                        }}
                      >
                        Interface Scale…
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="btn"
                        style={{ border: 'none', justifyContent: 'flex-start' }}
                        onClick={() => {
                          setOptionsSubOpen(false);
                          setShowMoreMenu(false);
                          onOpenShortcuts();
                        }}
                      >
                        Shortcuts…
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start' }}
                onClick={() => {
                  setShowMoreMenu(false);
                  onOpenResize();
                }}
              >
                Resize Canvas…
              </button>
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start' }}
                onClick={() => {
                  setShowMoreMenu(false);
                  onToggleTiledMode();
                }}
              >
                {tiledMode ? 'Tiled / Seamless: On' : 'Tiled / Seamless Mode'}
              </button>
            </div>
          )}
        </div>

        <div style={{ minWidth: 0, maxWidth: 190, display: 'flex', alignItems: 'center', gap: 6 }}>
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = nameDraft.trim();
                if (trimmed) onRenameProject(trimmed);
                setEditingName(false);
              }}
            >
              <input
                autoFocus
                aria-label="Project name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  const trimmed = nameDraft.trim();
                  if (trimmed) onRenameProject(trimmed);
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditingName(false);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '1px 5px',
                  borderRadius: 5,
                  border: '1px solid var(--accent)',
                  background: 'var(--surface-elevated)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: 13.5,
                  outline: 'none',
                }}
              />
            </form>
          ) : (
            <h1
              onDoubleClick={() => {
                setNameDraft(projectName);
                setEditingName(true);
              }}
              title="Double-click to rename"
              style={{
                margin: 0,
                minWidth: 0,
                fontWeight: 700,
                fontSize: 13.5,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'text',
              }}
            >
              {projectName}
            </h1>
          )}
          {saveStatus === 'error' ? (
            <button
              type="button"
              role="status"
              aria-label="Save failed. Click to retry"
              title="Save failed — click to retry"
              onClick={onSaveProject}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: 'none',
                background: 'transparent',
                padding: 2,
                borderRadius: 4,
                color: 'var(--danger)',
                cursor: 'pointer',
              }}
            >
              <AlertCircle size={13} />
            </button>
          ) : (
            <span
              role="status"
              aria-label={saveStatus === 'saving' ? 'Saving project' : 'All changes saved'}
              title={saveStatus === 'saving' ? 'Saving…' : 'Saved'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: saveStatus === 'saving' ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'color 180ms ease, transform 180ms ease',
              }}
            >
              {saveStatus === 'saving' ? (
                <Loader2 size={12} className="spin" />
              ) : (
                <Check size={12} />
              )}
            </span>
          )}
        </div>
      </div>

      <div
        className="editor-header-divider"
        style={{ width: 1, height: 26, background: 'var(--border)', flexShrink: 0 }}
      />

      {/* Center: Tool Options + Inline Palette */}
      <div
        className="editor-header-center"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 8,
        }}
      >
        <div className="header-pill-group" style={{ gap: 4, padding: '0 4px' }}>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 26, height: 26, borderRadius: 6 }}
            aria-label={`Brush shape: ${brushShape}. Click to switch`}
            title={`Brush shape: ${brushShape} (click to switch)`}
            onClick={onToggleBrushShape}
          >
            {brushShape === 'round' ? (
              <Circle size={13} fill="currentColor" />
            ) : (
              <Square size={13} fill="currentColor" />
            )}
          </button>
          <div
            aria-hidden="true"
            style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }}
          />
          {editingBrushSize ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parseInt(brushSizeDraft, 10);
                if (!isNaN(parsed)) {
                  onChangeBrushSize(Math.max(1, Math.min(128, parsed)));
                }
                setEditingBrushSize(false);
              }}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              <input
                autoFocus
                type="number"
                aria-label="Brush size in pixels"
                min={1}
                max={128}
                value={brushSizeDraft}
                onChange={(e) => setBrushSizeDraft(e.target.value)}
                onBlur={() => {
                  const parsed = parseInt(brushSizeDraft, 10);
                  if (!isNaN(parsed)) {
                    onChangeBrushSize(Math.max(1, Math.min(128, parsed)));
                  }
                  setEditingBrushSize(false);
                }}
                className="mono"
                style={{
                  width: 46,
                  height: 24,
                  padding: '0 4px',
                  borderRadius: 6,
                  border: '1px solid var(--accent)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  textAlign: 'center',
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              className="btn mono"
              style={{
                border: 'none',
                minWidth: 44,
                height: 26,
                padding: '0 6px',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                background: 'transparent',
                borderRadius: 6,
                cursor: 'ew-resize',
                touchAction: 'none',
              }}
              aria-label={`Brush size ${brushSize}px. Drag left or right to resize, or click to type`}
              title="Drag left/right to resize • Click to type"
              onPointerDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startSize = brushSize;
                let moved = false;
                onPreviewingSizeChange(true);

                const onMove = (ev: PointerEvent) => {
                  const dx = ev.clientX - startX;
                  if (Math.abs(dx) >= 4) moved = true;
                  if (moved) {
                    const nextSize = Math.max(1, Math.min(128, Math.round(startSize + dx / 6)));
                    onChangeBrushSize(nextSize);
                  }
                };

                const onUp = () => {
                  onPreviewingSizeChange(false);
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  window.removeEventListener('pointercancel', onUp);
                  if (!moved) {
                    setBrushSizeDraft(String(startSize));
                    setEditingBrushSize(true);
                  }
                };

                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
                window.addEventListener('pointercancel', onUp);
              }}
            >
              {brushSize}px
            </button>
          )}
        </div>

        <div
          ref={gridMenuRef}
          className={`header-pill-group ${gridMode !== 'off' ? 'active' : ''}`}
          style={{ position: 'relative' }}
        >
          <button
            type="button"
            className="icon-btn"
            style={{
              width: 'auto',
              minWidth: 28,
              height: 26,
              borderRadius: 6,
              padding: '0 6px',
              gap: 4,
              border: 'none',
              background: 'transparent',
              color: gridMode !== 'off' ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            aria-label={
              gridMode !== 'off'
                ? `Grid: ${gridMode}. Click to turn off`
                : `Turn on ${lastGridMode} grid`
            }
            aria-pressed={gridMode !== 'off'}
            title={
              gridMode !== 'off'
                ? `Grid: ${gridMode} (click to turn off)`
                : `Grid: off (click to enable ${lastGridMode})`
            }
            onClick={() => {
              setGridMenuOpen(false);
              onChangeGridMode((cur) => (cur === 'off' ? lastGridMode : 'off'));
            }}
          >
            {(gridMode === 'tile' || (gridMode === 'off' && lastGridMode === 'tile')) ? (
              <Grid2x2 size={17} />
            ) : (
              <Grid3x3 size={17} />
            )}
            {gridMode !== 'off' && (
              <span className="mono" style={{ fontSize: 10, fontWeight: 700 }}>
                {gridMode === 'pixel' ? '1' : gridMode === 'tile' ? '16' : '1+16'}
              </span>
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{
              width: 20,
              height: 26,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: gridMode !== 'off' ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            aria-label="Choose grid mode"
            aria-haspopup="menu"
            aria-expanded={gridMenuOpen}
            title="Choose grid mode (Pixel 1×1 / Tile 16×16 / Both)"
            onClick={() => setGridMenuOpen((v) => !v)}
          >
            <ChevronDown size={12} />
          </button>
          {gridMenuOpen && (() => {
            const rect = gridMenuRef.current?.getBoundingClientRect();
            const menuLeft = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 180)) : 8;
            const menuTop = rect ? rect.bottom + 6 : 54;
            return (
              <div
                role="menu"
                aria-label="Grid mode"
                className="floating-card menu-pop"
                style={{
                  position: 'fixed',
                  top: menuTop,
                  left: menuLeft,
                  width: 172,
                  padding: 5,
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  zIndex: 60,
                  transformOrigin: 'top left',
                }}
              >
                {(
                  [
                    ['pixel', 'Pixel (1×1)', <Grid3x3 key="px" size={14} />],
                    ['tile', 'Tile (16×16)', <Grid2x2 key="tl" size={14} />],
                    ['both', 'Both (1×1 + 16×16)', <Grid3x3 key="bt" size={14} />],
                  ] as Array<[Exclude<GridMode, 'off'>, string, React.ReactNode]>
                ).map(([mode, label, icon]) => {
                  const active = gridMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className={`btn ${active ? 'primary' : ''}`}
                      style={{
                        border: 'none',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        padding: '6px 8px',
                      }}
                      onClick={() => {
                        setLastGridMode(mode);
                        onChangeGridMode(mode);
                        setGridMenuOpen(false);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {icon}
                        <span>{label}</span>
                      </span>
                      {active && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div
          ref={mirrorMenuRef}
          className={`header-pill-group ${mirror !== 'none' ? 'active' : ''}`}
          style={{ position: 'relative' }}
        >
          <button
            type="button"
            className="icon-btn"
            style={{
              width: 'auto',
              minWidth: 28,
              height: 26,
              borderRadius: 6,
              padding: '0 6px',
              gap: 4,
              border: 'none',
              background: 'transparent',
              color: mirror !== 'none' ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            aria-label={
              mirror !== 'none'
                ? `Mirror: ${mirror}. Click to turn off`
                : `Turn on ${lastMirrorMode} mirror`
            }
            aria-pressed={mirror !== 'none'}
            title={
              mirror !== 'none'
                ? `Mirror: ${mirror} (click to turn off)`
                : `Mirror: off (click to enable ${lastMirrorMode})`
            }
            onClick={() => {
              setMirrorMenuOpen(false);
              onChangeMirror((cur) => (cur === 'none' ? lastMirrorMode : 'none'));
            }}
          >
            {(mirror === 'vertical' || (mirror === 'none' && lastMirrorMode === 'vertical')) ? (
              <FlipVertical size={17} />
            ) : (
              <FlipHorizontal size={17} />
            )}
            {mirror !== 'none' && (
              <span className="mono" style={{ fontSize: 10, fontWeight: 700 }}>
                {mirror === 'horizontal' ? 'H' : mirror === 'vertical' ? 'V' : 'Q'}
              </span>
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{
              width: 20,
              height: 26,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: mirror !== 'none' ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            aria-label="Choose mirror axis"
            aria-haspopup="menu"
            aria-expanded={mirrorMenuOpen}
            title="Choose mirror axis (Horizontal / Vertical / Quad)"
            onClick={() => setMirrorMenuOpen((v) => !v)}
          >
            <ChevronDown size={12} />
          </button>
          {mirrorMenuOpen && (() => {
            const rect = mirrorMenuRef.current?.getBoundingClientRect();
            const menuLeft = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 168)) : 8;
            const menuTop = rect ? rect.bottom + 6 : 54;
            return (
              <div
                role="menu"
                aria-label="Mirror axis"
                className="floating-card menu-pop"
                style={{
                  position: 'fixed',
                  top: menuTop,
                  left: menuLeft,
                  width: 160,
                  padding: 5,
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  zIndex: 60,
                  transformOrigin: 'top left',
                }}
              >
                {(
                  [
                    ['horizontal', 'Horizontal'],
                    ['vertical', 'Vertical'],
                    ['quad', 'Quad (H + V)'],
                  ] as Array<[Exclude<MirrorMode, 'none'>, string]>
                ).map(([mode, label]) => {
                  const active = mirror === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className={`btn ${active ? 'primary' : ''}`}
                      style={{
                        border: 'none',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        padding: '6px 8px',
                      }}
                      onClick={() => {
                        setLastMirrorMode(mode);
                        onChangeMirror(mode);
                        setMirrorMenuOpen(false);
                      }}
                    >
                      <span>{label}</span>
                      {active && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <ColorPanel
          activeColor={activeColor}
          palette={palette}
          isEyedropperActive={tool === 'eyedropper'}
          onToggleEyedropper={onToggleEyedropper}
          onSelectColor={onSelectColor}
          onSetPalette={onSetPalette}
        />
      </div>

      {/* Right Zone: Theme Switch & Export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={theme === 'dark' ? 'Dark Theme (click for Light)' : 'Light Theme (click for Dark)'}
          onClick={onToggleTheme}
          style={{
            position: 'relative',
            width: 54,
            height: 30,
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--surface-elevated)',
            padding: '0 6px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            color: 'var(--text-muted)',
          }}
        >
          <Sun size={13} style={{ opacity: theme === 'light' ? 0 : 0.7 }} />
          <Moon size={13} style={{ opacity: theme === 'dark' ? 0 : 0.7 }} />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 3,
              left: theme === 'dark' ? 27 : 3,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'left 180ms cubic-bezier(0.22, 1, 0.36, 1)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            }}
          >
            {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
          </span>
        </button>

        <button
          type="button"
          className="btn primary"
          style={{ height: 34, padding: '0 11px', fontSize: 12.5 }}
          aria-label="Export sprite"
          title="Export sprite"
          onClick={onOpenExport}
        >
          <Download size={14} />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
