import {
  Check,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Plus,
  RotateCw,
  Scissors,
  X,
} from 'lucide-react';
import { GridRect } from '../../engine/types';

export interface SelectionActionBarProps {
  hasCurve: boolean;
  selection: GridRect | null;
  popupLeft: number;
  popupTop: number;
  hasClipboard: boolean;
  hasFloating: boolean;
  onAddCurvePoint: () => void;
  onCommitCurve: () => void;
  onCancelCurve: () => void;
  onCopySelection: () => void;
  onPasteSelection: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onRotate90: () => void;
  onDeletePixels: () => void;
  onResizeFloating: (w: number, h: number) => void;
  onCommitFloating: () => void;
  onCancelFloating: () => void;
}

export function SelectionActionBar({
  hasCurve,
  selection,
  popupLeft,
  popupTop,
  hasClipboard,
  hasFloating,
  onAddCurvePoint,
  onCommitCurve,
  onCancelCurve,
  onCopySelection,
  onPasteSelection,
  onFlipH,
  onFlipV,
  onRotate90,
  onDeletePixels,
  onResizeFloating,
  onCommitFloating,
  onCancelFloating,
}: SelectionActionBarProps) {
  if (!hasCurve && !selection) return null;

  return (
    <div
      className="floating-card menu-pop"
      style={{
        position: 'absolute',
        left: popupLeft,
        top: popupTop,
        padding: 4,
        display: 'flex',
        gap: 2,
        zIndex: 30,
        transformOrigin: 'top center',
      }}
    >
      {hasCurve ? (
        <>
          <button
            type="button"
            className="icon-btn"
            aria-label="Add curve control point"
            title="Add control point"
            onClick={onAddCurvePoint}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="icon-btn active"
            aria-label="Apply curve"
            title="Apply curve"
            onClick={onCommitCurve}
          >
            <Check size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cancel curve"
            title="Cancel curve"
            onClick={onCancelCurve}
          >
            <X size={18} />
          </button>
        </>
      ) : (
        selection && (
          <>
            <button
              type="button"
              className="icon-btn"
              title="Copy selection"
              aria-label="Copy selection"
              onClick={onCopySelection}
            >
              <Copy size={16} />
            </button>
            {hasClipboard && (
              <button
                type="button"
                className="icon-btn"
                title="Paste as movable selection"
                aria-label="Paste"
                onClick={onPasteSelection}
              >
                <Plus size={16} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              title="Flip Horizontal"
              aria-label="Flip selection horizontal"
              onClick={onFlipH}
            >
              <FlipHorizontal size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Flip Vertical"
              aria-label="Flip selection vertical"
              onClick={onFlipV}
            >
              <FlipVertical size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Rotate 90°"
              aria-label="Rotate selection 90 degrees"
              onClick={onRotate90}
            >
              <RotateCw size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Delete selection pixels (Backspace / Delete)"
              aria-label="Delete selection pixels"
              onClick={onDeletePixels}
            >
              <Scissors size={16} />
            </button>
            {hasFloating && (
              <>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '0 4px',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>W</span>
                  <input
                    type="number"
                    aria-label="Selection width"
                    min={1}
                    max={1024}
                    value={selection.width}
                    onChange={(e) => {
                      const w = parseInt(e.target.value, 10);
                      if (!isNaN(w) && w >= 1) {
                        onResizeFloating(w, selection.height);
                      }
                    }}
                    className="field-input mono"
                    style={{ width: 48, padding: '2px 4px', fontSize: 11 }}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    aria-label="Selection height"
                    min={1}
                    max={1024}
                    value={selection.height}
                    onChange={(e) => {
                      const h = parseInt(e.target.value, 10);
                      if (!isNaN(h) && h >= 1) {
                        onResizeFloating(selection.width, h);
                      }
                    }}
                    className="field-input mono"
                    style={{ width: 48, padding: '2px 4px', fontSize: 11 }}
                  />
                </div>
                <button
                  type="button"
                  className="icon-btn active"
                  title="Apply move/transform (Enter)"
                  aria-label="Apply selection transform"
                  onClick={onCommitFloating}
                >
                  <Check size={16} />
                </button>
              </>
            )}
            <button
              type="button"
              className="icon-btn"
              title="Deselect / Cancel (Escape)"
              aria-label="Deselect"
              onClick={onCancelFloating}
            >
              <X size={16} />
            </button>
          </>
        )
      )}
    </div>
  );
}
