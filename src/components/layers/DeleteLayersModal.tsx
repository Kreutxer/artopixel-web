import { useRef } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function DeleteLayersModal({
  layerNames,
  onCancel,
  onConfirm,
}: {
  layerNames: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(onCancel);
  useFocusTrap(dialogRef);
  const count = layerNames.length;
  const title =
    count === 1 ? `Delete "${layerNames[0]}"?` : `Delete ${count} Layers?`;

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
        aria-labelledby="delete-layers-title"
        className="floating-card"
        style={{
          width: 'min(360px, calc(100vw - 24px))',
          padding: 18,
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 id="delete-layers-title" style={{ margin: 0, fontSize: 15 }}>
            {title}
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
          {count === 1
            ? 'This layer and its pixels will be removed from the current frame.'
            : `These ${count} layers and their pixels will be removed from the current frame.`}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{
              background: 'var(--danger)',
              borderColor: 'var(--danger)',
              color: '#fff',
            }}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
