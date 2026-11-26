import { X } from 'lucide-react';
import { PixelLayer, PixelTool } from '../../engine/types';

export interface EditorToastsProps {
  tool: PixelTool;
  moveAllLayers: boolean;
  onSetMoveAllLayers: (all: boolean) => void;
  layerCount: number;
  importError: string | null;
  onDismissImportError: () => void;
  layerFinderToast: string | null;
  hiddenLayerToast: boolean;
  layersOpen: boolean;
  layersWidth: number;
  layersResizing: boolean;
  timelineOpen: boolean;
  timelineHeight: number;
  timelineResizing: boolean;
  uiScale: number;
  onShowActiveLayer: () => void;
  deletedLayerToast: {
    layers: PixelLayer[];
    activeLayerIndex: number;
  } | null;
  onUndoDeleteLayer: () => void;
  onDismissDeletedLayerToast: () => void;
}

export function EditorToasts({
  tool,
  moveAllLayers,
  onSetMoveAllLayers,
  layerCount,
  importError,
  onDismissImportError,
  layerFinderToast,
  hiddenLayerToast,
  layersOpen,
  layersWidth,
  layersResizing,
  timelineOpen,
  timelineHeight,
  timelineResizing,
  uiScale,
  onShowActiveLayer,
  deletedLayerToast,
  onUndoDeleteLayer,
  onDismissDeletedLayerToast,
}: EditorToastsProps) {
  return (
    <>
      {tool === 'move' && (
        <div
          className="floating-card"
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            zIndex: 30,
          }}
        >
          <button
            type="button"
            className={`btn ${!moveAllLayers ? 'primary' : ''}`}
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            onClick={() => onSetMoveAllLayers(false)}
          >
            Selected Layer(s)
          </button>
          <button
            type="button"
            className={`btn ${moveAllLayers ? 'primary' : ''}`}
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            onClick={() => onSetMoveAllLayers(true)}
          >
            All Layers ({layerCount})
          </button>
        </div>
      )}

      {importError && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 55,
            maxWidth: 'min(420px, calc(100vw - 24px))',
          }}
        >
          <div
            role="alert"
            className="floating-card menu-pop"
            style={{
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--danger)',
              borderColor: 'var(--danger)',
            }}
          >
            <span>{importError}</span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 24, height: 24, flexShrink: 0 }}
              aria-label="Dismiss import error"
              onClick={onDismissImportError}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {layerFinderToast && (
        <div
          style={{
            position: 'absolute',
            top: !layersOpen && (tool === 'move' || hiddenLayerToast) ? 94 : 52,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 45,
            pointerEvents: 'none',
          }}
        >
          <div
            role="status"
            className="floating-card menu-pop"
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              transformOrigin: 'top center',
            }}
          >
            {layerFinderToast}
          </div>
        </div>
      )}

      {hiddenLayerToast && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 45,
          }}
        >
          <div
            role="status"
            className="floating-card menu-pop"
            style={{
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              transformOrigin: 'top center',
            }}
          >
            <span>Active layer is hidden</span>
            <button
              type="button"
              className="btn primary"
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={onShowActiveLayer}
            >
              Show Layer
            </button>
          </div>
        </div>
      )}

      {deletedLayerToast && (
        <div
          role="status"
          className="floating-card menu-pop-up"
          style={{
            position: 'absolute',
            bottom: timelineOpen
              ? Math.round(timelineHeight * uiScale) + 12
              : Math.round(24 * uiScale),
            right: layersOpen
              ? Math.round(
                  Math.min(
                    layersWidth,
                    typeof window !== 'undefined' ? window.innerWidth * 0.74 : layersWidth
                  ) * uiScale
                ) + 12
              : Math.round(26 * uiScale),
            transition:
              timelineResizing || layersResizing
                ? 'none'
                : 'bottom 220ms cubic-bezier(0.22, 1, 0.36, 1), right 200ms cubic-bezier(0.22, 1, 0.36, 1)',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            zIndex: 45,
          }}
        >
          <span>Layer deleted</span>
          <button
            type="button"
            className="btn primary"
            style={{ padding: '3px 8px', fontSize: 11 }}
            onClick={onUndoDeleteLayer}
          >
            Undo
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 28, height: 28 }}
            aria-label="Dismiss notification"
            onClick={onDismissDeletedLayerToast}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </>
  );
}
