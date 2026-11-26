import { useRef } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function DeleteGroupModal({
  groupName,
  layerCount,
  onCancel,
  onUngroupOnly,
  onDeleteAll,
}: {
  groupName: string;
  layerCount: number;
  onCancel: () => void;
  onUngroupOnly: () => void;
  onDeleteAll: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(onCancel);
  useFocusTrap(dialogRef);
  return (
    <div
      className="modal-backdrop"
      style={{ pointerEvents: 'auto' }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-group-title"
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 id="delete-group-title" style={{ margin: 0, fontSize: 15 }}>
            Delete Group &ldquo;{groupName}&rdquo;?
          </h3>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 28, height: 28, flexShrink: 0 }}
            aria-label="Close dialog"
            onClick={onCancel}
          >
            <X size={15} />
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          This group contains {layerCount} layer
          {layerCount === 1 ? '' : 's'}. Choose whether to keep them ungrouped or delete everything inside.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="btn"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={onUngroupOnly}
          >
            Ungroup Only (Keep Layers)
          </button>
          <button
            type="button"
            className="btn danger"
            style={{
              width: '100%',
              justifyContent: 'center',
            }}
            onClick={onDeleteAll}
          >
            Delete Group &amp; Layers
          </button>
        </div>
      </div>
    </div>
  );
}
