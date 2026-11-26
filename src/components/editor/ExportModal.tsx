import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { downloadProjectApxl } from '../../engine/apxlFormat';
import { downloadProjectAseprite } from '../../engine/asepriteParser';
import { downloadProjectGif, downloadProjectSpritesheet } from '../../engine/gifEncoder';
import { downloadProjectPng } from '../../engine/storage';
import { CanvasFolder, PixelProject } from '../../engine/types';
import {
  downloadFolderZip,
  getCanvasesForScope,
  ZipExportContent,
} from '../../engine/zipExport';

function ThemedSelect<T extends string | number>({
  ariaLabel,
  value,
  options,
  mono,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  mono?: boolean;
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: 210 }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`field-select ${mono ? 'mono' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: mono ? 12 : 12.5,
          borderColor: open ? 'var(--accent)' : 'var(--border)',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="floating-card menu-pop"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            padding: 4,
            background: 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            zIndex: 80,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={active}
                className={`btn ${mono ? 'mono' : ''}`}
                style={{
                  border: 'none',
                  justifyContent: 'space-between',
                  fontSize: mono ? 12 : 12.5,
                  padding: '6px 8px',
                  color: active ? 'var(--accent)' : 'var(--text-primary)',
                  background: active ? 'var(--accent-container)' : 'transparent',
                }}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span>{opt.label}</span>
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function buildFolderScopeOptions(folders: CanvasFolder[]): Array<{ value: string; label: string }> {
  const byParent = new Map<string | null, CanvasFolder[]>();
  for (const f of folders) {
    const key = f.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  const result: Array<{ value: string; label: string }> = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, prefix: string) => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      const pathLabel = prefix ? `${prefix} / ${child.name}` : child.name;
      result.push({ value: child.id, label: `Folder: ${pathLabel}` });
      walk(child.id, pathLabel);
    }
  };
  walk(null, '');
  return result;
}

export function ExportModal({
  project,
  palette,
  initialScope = 'active',
  onClose,
}: {
  project: PixelProject;
  palette: number[];
  initialScope?: string;
  onClose: () => void;
}) {
  const [exportScope, setExportScope] = useState<string>(initialScope);
  const [exportFormat, setExportFormat] = useState<'png' | 'spritesheet' | 'gif' | 'aseprite' | 'apxl'>('png');
  const [zipContent, setZipContent] = useState<ZipExportContent>('both');
  const [exportScale, setExportScale] = useState(8);
  const [sheetLayout, setSheetLayout] = useState<'horizontal' | 'grid'>('horizontal');
  const [sheetCols, setSheetCols] = useState(4);
  const [isExporting, setIsExporting] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(onClose);
  useFocusTrap(dialogRef);

  const hasMultiCanvas = (project.canvases?.length ?? 0) > 0;
  const scopeOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: 'active', label: 'Active Canvas' },
    ];
    if (project.canvasFolders?.length) {
      opts.push(...buildFolderScopeOptions(project.canvasFolders));
    }
    if (hasMultiCanvas) {
      opts.push({ value: 'all', label: 'All Canvases (.zip)' });
    }
    return opts;
  }, [hasMultiCanvas, project.canvasFolders]);

  const isZipScope = hasMultiCanvas && exportScope !== 'active';
  const zipTargetCanvases = useMemo(
    () => (isZipScope ? getCanvasesForScope(project, exportScope) : []),
    [isZipScope, project, exportScope]
  );

  const frameCount = project.frames?.length ?? 1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        className="floating-card"
        style={{
          width: 'min(380px, calc(100vw - 24px))',
          padding: 18,
          background: 'var(--surface)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="export-modal-title" style={{ margin: '0 0 14px', fontSize: 15 }}>
          {isZipScope ? 'Export Folder (.zip)' : 'Export Sprite'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {hasMultiCanvas && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 12.5,
                color: 'var(--text-secondary)',
              }}
            >
              <span>Scope</span>
              <ThemedSelect
                ariaLabel="Export scope"
                value={exportScope}
                onChange={(v) => setExportScope(v)}
                options={scopeOptions}
              />
            </div>
          )}

          {isZipScope ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                }}
              >
                <span>Contents</span>
                <ThemedSelect
                  ariaLabel="Archive contents"
                  value={zipContent}
                  onChange={(v) => setZipContent(v)}
                  options={[
                    { value: 'png', label: 'PNG Images (.png)' },
                    { value: 'apxl', label: 'ArtoPixel Source (.apxl)' },
                    { value: 'both', label: 'Both (png/ + source/)' },
                  ]}
                />
              </div>

              {(zipContent === 'png' || zipContent === 'both') && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>PNG Scale</span>
                  <ThemedSelect
                    ariaLabel="Export scale"
                    mono
                    value={exportScale}
                    onChange={(v) => setExportScale(v)}
                    options={[1, 2, 4, 8, 16].map((s) => ({
                      value: s,
                      label: `${s}x`,
                    }))}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                }}
              >
                <span>Format</span>
                <ThemedSelect
                  ariaLabel="Export format"
                  value={exportFormat}
                  onChange={(v) => setExportFormat(v)}
                  options={[
                    { value: 'png', label: 'PNG Image' },
                    { value: 'spritesheet', label: 'Spritesheet (PNG)' },
                    { value: 'gif', label: 'Animated GIF' },
                    { value: 'apxl', label: 'ArtoPixel (.apxl)' },
                    { value: 'aseprite', label: 'Aseprite (.aseprite)' },
                  ]}
                />
              </div>

              {exportFormat !== 'aseprite' && exportFormat !== 'apxl' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>Size</span>
                  <ThemedSelect
                    ariaLabel="Export scale"
                    mono
                    value={exportScale}
                    onChange={(v) => setExportScale(v)}
                    options={[1, 2, 4, 8, 16].map((s) => ({
                      value: s,
                      label: `${s}x (${project.width * s}×${project.height * s} px)`,
                    }))}
                  />
                </div>
              )}

              {exportFormat === 'spritesheet' && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>Layout</span>
                    <ThemedSelect
                      ariaLabel="Spritesheet layout"
                      value={sheetLayout}
                      onChange={(v) => setSheetLayout(v)}
                      options={[
                        { value: 'horizontal', label: 'Horizontal Strip' },
                        { value: 'grid', label: 'Grid' },
                      ]}
                    />
                  </div>
                  {sheetLayout === 'grid' && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 12.5,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span>Columns</span>
                      <input
                        type="number"
                        aria-label="Grid columns"
                        min={1}
                        max={Math.max(1, frameCount)}
                        value={sheetCols}
                        onChange={(e) => setSheetCols(Math.max(1, Number(e.target.value) || 1))}
                        className="field-input mono"
                        style={{ width: 210, fontSize: 12 }}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div
          className="mono"
          style={{
            fontSize: 11.5,
            color: isZipScope && zipTargetCanvases.length === 0 ? 'var(--danger)' : 'var(--text-muted)',
            padding: '6px 8px',
            borderRadius: 7,
            background: 'var(--surface-elevated)',
            marginBottom: 14,
          }}
        >
          {isZipScope ? (
            zipTargetCanvases.length === 0 ? (
              <>This folder has no canvases to export.</>
            ) : (
              <>
                {zipTargetCanvases.length} canvas{zipTargetCanvases.length === 1 ? '' : 'es'} •{' '}
                {zipContent === 'both'
                  ? `png/ (${exportScale}x) + source/ (.apxl)`
                  : zipContent === 'png'
                  ? `PNG (${exportScale}x) in .zip`
                  : 'ArtoPixel (.apxl) in .zip'}
              </>
            )
          ) : (
            <>
              {exportFormat === 'png' && (
                <>Output: {project.width * exportScale}×{project.height * exportScale} px</>
              )}
              {exportFormat === 'spritesheet' && (() => {
                const cols = sheetLayout === 'horizontal' ? frameCount : Math.max(1, Math.min(sheetCols, frameCount));
                const rows = sheetLayout === 'horizontal' ? 1 : Math.ceil(frameCount / cols);
                return (
                  <>
                    Sheet: {frameCount} frame{frameCount === 1 ? '' : 's'} • {cols * project.width * exportScale}×{rows * project.height * exportScale} px
                  </>
                );
              })()}
              {exportFormat === 'gif' && (
                <>
                  GIF: {frameCount} frame{frameCount === 1 ? '' : 's'} @ {project.fps ?? 8} FPS • {project.width * exportScale}×{project.height * exportScale} px
                </>
              )}
              {exportFormat === 'apxl' && (
                <>
                  Full ArtoPixel project ({frameCount} frame{frameCount === 1 ? '' : 's'}, {project.layers.length} layer{project.layers.length === 1 ? '' : 's'}, reference &amp; alpha locks)
                </>
              )}
              {exportFormat === 'aseprite' && (
                <>
                  {frameCount} frame{frameCount === 1 ? '' : 's'}, {project.layers.length} layer{project.layers.length === 1 ? '' : 's'}
                  {project.groups.length > 0 ? `, ${project.groups.length} group(s)` : ''} • 32-bit RGBA
                </>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose} disabled={isExporting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={isExporting || (isZipScope && zipTargetCanvases.length === 0)}
            onClick={async () => {
              if (isZipScope) {
                setIsExporting(true);
                try {
                  await downloadFolderZip({
                    project,
                    scope: exportScope,
                    content: zipContent,
                    scale: exportScale,
                  });
                  onClose();
                } finally {
                  setIsExporting(false);
                }
                return;
              }
              if (exportFormat === 'png') {
                downloadProjectPng(project, exportScale);
              } else if (exportFormat === 'spritesheet') {
                downloadProjectSpritesheet(project, exportScale, sheetLayout, sheetCols);
              } else if (exportFormat === 'gif') {
                downloadProjectGif(project, exportScale, project.fps ?? 8);
              } else if (exportFormat === 'apxl') {
                await downloadProjectApxl(project);
              } else {
                await downloadProjectAseprite(project, palette);
              }
              onClose();
            }}
          >
            {isExporting ? 'Exporting…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
