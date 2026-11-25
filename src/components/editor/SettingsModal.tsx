import { useRef } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const SCALE_PRESETS = [1, 1.15, 1.25, 1.35];

export function SettingsModal({
  uiScale,
  onChangeUiScale,
  onClose,
}: {
  uiScale: number;
  onChangeUiScale: (next: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(onClose);
  useFocusTrap(dialogRef);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 id="settings-modal-title" style={{ margin: 0, fontSize: 15 }}>
            Settings
          </h3>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 28, height: 28 }}
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              Interface Scale
            </span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
              {Math.round(uiScale * 100)}%
            </span>
          </div>
          <input
            type="range"
            aria-label="Interface scale"
            min={90}
            max={150}
            step={5}
            value={Math.round(uiScale * 100)}
            onChange={(e) => onChangeUiScale(Number(e.target.value) / 100)}
            style={{ accentColor: 'var(--accent)', width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SCALE_PRESETS.map((preset) => {
              const active = Math.abs(uiScale - preset) < 0.01;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`btn mono ${active ? 'primary' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 11.5, padding: '5px 8px' }}
                  onClick={() => onChangeUiScale(preset)}
                >
                  {Math.round(preset * 100)}%
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Adjusts toolbar, panel, and menu sizing without affecting pixel canvas sharpness.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
