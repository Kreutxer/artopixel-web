import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { computeOpaqueBounds } from '../../engine/pixelEngine';
import { PixelProject } from '../../engine/types';

export function ResizeCanvasModal({
  project,
  onApplyResize,
  onClose,
}: {
  project: PixelProject;
  onApplyResize: (newW: number, newH: number, offsetX: number, offsetY: number) => void;
  onClose: () => void;
}) {
  const [resizeW, setResizeW] = useState(project.width);
  const [resizeH, setResizeH] = useState(project.height);
  const [anchorX, setAnchorX] = useState<'left' | 'center' | 'right'>('center');
  const [anchorY, setAnchorY] = useState<'top' | 'center' | 'bottom'>('center');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(onClose);
  useFocusTrap(dialogRef);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resize-modal-title"
        className="floating-card"
        style={{
          width: 'min(360px, calc(100vw - 24px))',
          padding: 18,
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 id="resize-modal-title" style={{ margin: 0, fontSize: 15 }}>
            Resize Canvas
          </h3>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 28, height: 28 }}
            aria-label="Close resize dialog"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
            Width (4–1024)
            <input
              type="number"
              min={4}
              max={1024}
              value={resizeW}
              onChange={(e) => setResizeW(Math.max(4, Math.min(1024, Number(e.target.value) || 4)))}
              className="field-input mono"
              style={{ marginTop: 4 }}
            />
          </label>
          <label style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
            Height (4–1024)
            <input
              type="number"
              min={4}
              max={1024}
              value={resizeH}
              onChange={(e) => setResizeH(Math.max(4, Math.min(1024, Number(e.target.value) || 4)))}
              className="field-input mono"
              style={{ marginTop: 4 }}
            />
          </label>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Anchor
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 4 }}>
            {(['top', 'center', 'bottom'] as const).map((ay) =>
              (['left', 'center', 'right'] as const).map((ax) => {
                const active = anchorX === ax && anchorY === ay;
                return (
                  <button
                    key={`${ay}-${ax}`}
                    type="button"
                    className={`icon-btn ${active ? 'active' : ''}`}
                    style={{ width: 34, height: 34, fontSize: 11 }}
                    aria-label={`Anchor ${ay} ${ax}`}
                    onClick={() => {
                      setAnchorX(ax);
                      setAnchorY(ay);
                    }}
                  >
                    •
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12 }}
            onClick={() => {
              const bounds = computeOpaqueBounds(project);
              if (!bounds) return;
              onApplyResize(bounds.width, bounds.height, -bounds.left, -bounds.top);
              onClose();
            }}
          >
            Trim Empty
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const dx =
                  anchorX === 'left'
                    ? 0
                    : anchorX === 'center'
                      ? Math.floor((resizeW - project.width) / 2)
                      : resizeW - project.width;
                const dy =
                  anchorY === 'top'
                    ? 0
                    : anchorY === 'center'
                      ? Math.floor((resizeH - project.height) / 2)
                      : resizeH - project.height;
                onApplyResize(resizeW, resizeH, dx, dy);
                onClose();
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
