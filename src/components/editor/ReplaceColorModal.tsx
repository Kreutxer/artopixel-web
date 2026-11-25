import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { argbToCss, argbToHex6 } from '../../engine/paletteQuantizer';

export function ReplaceColorModal({
  initialFromColor,
  initialToColor,
  palette,
  onApply,
  onClose,
}: {
  initialFromColor: number;
  initialToColor: number;
  palette: number[];
  onApply: (fromColor: number, toColor: number, allFrames: boolean) => void;
  onClose: () => void;
}) {
  const [fromColor, setFromColor] = useState(initialFromColor);
  const [toColor, setToColor] = useState(initialToColor);
  const [allFrames, setAllFrames] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(onClose);
  useFocusTrap(dialogRef);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-modal-title"
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
          <h3 id="replace-modal-title" style={{ margin: 0, fontSize: 15 }}>
            Replace Color
          </h3>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 28, height: 28 }}
            aria-label="Close replace color dialog"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
            From
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <input
                type="color"
                value={`#${argbToHex6(fromColor)}`}
                onChange={(e) => {
                  const rgb = parseInt(e.target.value.slice(1), 16);
                  setFromColor((0xff000000 | rgb) >>> 0);
                }}
                style={{ width: 32, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
              />
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                #{argbToHex6(fromColor)}
              </span>
            </div>
          </label>
          <label style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
            To
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <input
                type="color"
                value={`#${argbToHex6(toColor)}`}
                onChange={(e) => {
                  const rgb = parseInt(e.target.value.slice(1), 16);
                  setToColor((0xff000000 | rgb) >>> 0);
                }}
                style={{ width: 32, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
              />
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                #{argbToHex6(toColor)}
              </span>
            </div>
          </label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {palette.slice(0, 16).map((c, idx) => (
            <button
              key={`${c}-${idx}`}
              type="button"
              title={`Set To color #${argbToHex6(c)}`}
              onClick={() => setToColor(c)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                background: argbToCss(c),
                border: c === toColor ? '2px solid var(--accent)' : '1px solid var(--border)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allFrames}
            onChange={(e) => setAllFrames(e.target.checked)}
          />
          <span>Apply to all frames (active layer index)</span>
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onApply(fromColor, toColor, allFrames);
              onClose();
            }}
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
