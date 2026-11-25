import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  ShortcutAction,
} from '../../hooks/useShortcuts';

export function ShortcutsModal({
  shortcuts,
  onApply,
  onClose,
}: {
  shortcuts: Record<ShortcutAction, string>;
  onApply: (next: Record<ShortcutAction, string>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<ShortcutAction, string>>(() => ({ ...shortcuts }));
  const [listeningAction, setListeningAction] = useState<ShortcutAction | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmDialogRef = useRef<HTMLDivElement | null>(null);
  const resetDialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, !confirmDiscard && !confirmReset);
  useFocusTrap(confirmDialogRef, confirmDiscard);
  useFocusTrap(resetDialogRef, confirmReset);

  const hasUnsaved = JSON.stringify(draft) !== JSON.stringify(shortcuts);

  const attemptClose = useCallback(() => {
    setListeningAction(null);
    if (JSON.stringify(draft) !== JSON.stringify(shortcuts)) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }, [draft, shortcuts, onClose]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !listeningAction) {
        e.stopPropagation();
        if (confirmReset) {
          setConfirmReset(false);
        } else if (confirmDiscard) {
          setConfirmDiscard(false);
        } else {
          attemptClose();
        }
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [listeningAction, confirmDiscard, confirmReset, attemptClose]);

  useEffect(() => {
    if (!listeningAction) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListeningAction(null);
        return;
      }
      if (['Shift', 'Control', 'Meta'].includes(e.key)) return;
      const key = e.key.toLowerCase();
      setDraft((prev) => {
        const next = { ...prev };
        const oldKey = prev[listeningAction];
        for (const [act, k] of Object.entries(prev) as Array<[ShortcutAction, string]>) {
          if (act !== listeningAction && k === key) {
            next[act] = oldKey;
          }
        }
        next[listeningAction] = key;
        return next;
      });
      setListeningAction(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listeningAction]);

  return (
    <div className="modal-backdrop" onClick={attemptClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
        className="floating-card"
        style={{
          width: 'min(400px, calc(100vw - 24px))',
          maxHeight: '68vh',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '14px 16px 10px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <h3 id="help-modal-title" style={{ margin: 0, fontSize: 15 }}>
            Keyboard Shortcuts
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="btn"
              style={{ fontSize: 11.5, padding: '4px 10px' }}
              onClick={() => setConfirmReset(true)}
            >
              Reset Defaults
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              aria-label="Close shortcuts"
              title="Close"
              onClick={attemptClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
            Click any shortcut key below, then press a new key to rebind it.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 }}>
            {SHORTCUT_LABELS.map(([action, label]) => {
              const isListening = listeningAction === action;
              const keyText = isListening
                ? 'Press key…'
                : draft[action] === ' '
                  ? 'Space'
                  : draft[action] === 'alt'
                    ? 'Alt'
                    : draft[action].toUpperCase();
              return (
                <div
                  key={action}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '4px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>{label}</span>
                  <button
                    type="button"
                    className={`btn mono ${isListening ? 'primary' : ''}`}
                    style={{ minWidth: 56, justifyContent: 'center', padding: '4px 10px', fontSize: 12 }}
                    onClick={() => setListeningAction(isListening ? null : action)}
                  >
                    {keyText}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '10px 16px 14px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="btn primary"
            disabled={!hasUnsaved}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </button>
        </div>

        {confirmReset && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--backdrop)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              zIndex: 10,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={resetDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-reset-title"
              className="floating-card"
              style={{
                width: 'min(300px, 100%)',
                padding: 16,
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div id="shortcuts-reset-title" style={{ fontWeight: 700, fontSize: 14 }}>
                Reset shortcuts to default?
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                All custom keybindings will be restored to their defaults.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    setDraft({ ...DEFAULT_SHORTCUTS });
                    setListeningAction(null);
                    setConfirmReset(false);
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmDiscard && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--backdrop)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              zIndex: 10,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={confirmDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-discard-title"
              className="floating-card"
              style={{
                width: 'min(300px, 100%)',
                padding: 16,
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div id="shortcuts-discard-title" style={{ fontWeight: 700, fontSize: 14 }}>Save shortcut changes?</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                You have unapplied shortcut changes. Do you want to save them before closing?
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn" onClick={() => setConfirmDiscard(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setConfirmDiscard(false);
                    onClose();
                  }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    onApply(draft);
                    setConfirmDiscard(false);
                    onClose();
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
