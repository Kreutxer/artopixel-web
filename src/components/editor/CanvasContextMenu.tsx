import { useEffect, useRef, useState } from 'react';
import { PixelTool } from '../../engine/types';
import { useEscapeKey } from '../../hooks/useEscapeKey';

export function CanvasContextMenu({
  x,
  y,
  tool,
  shadeLighten,
  hasSelection,
  hasClipboard,
  canRotate,
  onClose,
  onEyedropper,
  onShade,
  onOpenReplaceColor,
  onOutline,
  onFlipLayerH,
  onFlipLayerV,
  onRotateLayer90,
  onResizeLayer,
  onCut,
  onCopy,
  onPaste,
  onFlipH,
  onFlipV,
  onRotate90,
  onDeselect,
}: {
  x: number;
  y: number;
  tool: PixelTool;
  shadeLighten: boolean;
  hasSelection: boolean;
  hasClipboard: boolean;
  canRotate: boolean;
  onClose: () => void;
  onEyedropper: () => void;
  onShade: (lighten: boolean) => void;
  onOpenReplaceColor: () => void;
  onOutline: () => void;
  onFlipLayerH: () => void;
  onFlipLayerV: () => void;
  onRotateLayer90: () => void;
  onResizeLayer: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onRotate90: () => void;
  onDeselect: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [colorSubOpen, setColorSubOpen] = useState(false);
  const [transformSubOpen, setTransformSubOpen] = useState(false);
  const [selSubOpen, setSelSubOpen] = useState(false);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const menuLeft = Math.max(8, Math.min(x, vw - 186));
  const menuTop = Math.max(8, Math.min(y, vh - 190));
  const canOpenRight = menuLeft + 170 + 168 <= vw;
  const canOpenLeft = menuLeft >= 172;
  const subPosStyle: React.CSSProperties = canOpenRight
    ? { left: '100%', paddingLeft: 4, top: menuTop + 250 > vh ? -110 : -4 }
    : canOpenLeft
      ? { right: '100%', paddingRight: 4, top: menuTop + 250 > vh ? -110 : -4 }
      : { right: 0, top: '100%', paddingTop: 4 };

  useEscapeKey(onClose);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="floating-card menu-pop"
      style={{
        position: 'fixed',
        left: menuLeft,
        top: menuTop,
        width: 170,
        padding: 5,
        background: 'var(--surface)',
        zIndex: 70,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        transformOrigin: 'top left',
      }}
    >
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => {
          setColorSubOpen(true);
          setTransformSubOpen(false);
          setSelSubOpen(false);
        }}
        onMouseLeave={() => setColorSubOpen(false)}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={colorSubOpen}
          className="btn"
          style={{ width: '100%', border: 'none', justifyContent: 'space-between', fontSize: 12.5 }}
          onClick={() => setColorSubOpen((v) => !v)}
        >
          <span>Color</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
        </button>

        {colorSubOpen && (
          <div
            style={{
              position: 'absolute',
              ...subPosStyle,
              zIndex: 71,
            }}
          >
            <div
              role="menu"
              className="floating-card menu-pop"
              style={{
                width: 164,
                maxHeight: 'calc(100vh - 24px)',
                overflowY: 'auto',
                padding: 5,
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
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                onClick={() => {
                  onEyedropper();
                  onClose();
                }}
              >
                Eyedropper
              </button>
              <button
                type="button"
                role="menuitem"
                className={`btn ${tool === 'shade' && !shadeLighten ? 'primary' : ''}`}
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                onClick={() => {
                  onShade(false);
                  onClose();
                }}
              >
                Darken
              </button>
              <button
                type="button"
                role="menuitem"
                className={`btn ${tool === 'shade' && shadeLighten ? 'primary' : ''}`}
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                onClick={() => {
                  onShade(true);
                  onClose();
                }}
              >
                Lighten
              </button>
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                onClick={() => {
                  onOpenReplaceColor();
                  onClose();
                }}
              >
                Replace Color…
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        role="menuitem"
        className="btn"
        style={{ width: '100%', border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
        onClick={() => {
          onOutline();
          onClose();
        }}
      >
        1px Outline
      </button>

      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => {
          setTransformSubOpen(true);
          setColorSubOpen(false);
          setSelSubOpen(false);
        }}
        onMouseLeave={() => setTransformSubOpen(false)}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={transformSubOpen}
          className="btn"
          style={{ width: '100%', border: 'none', justifyContent: 'space-between', fontSize: 12.5 }}
          onClick={() => setTransformSubOpen((v) => !v)}
        >
          <span>Transform</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
        </button>

        {transformSubOpen && (
          <div
            style={{
              position: 'absolute',
              ...subPosStyle,
              zIndex: 71,
            }}
          >
            <div
              role="menu"
              className="floating-card menu-pop"
              style={{
                width: 164,
                maxHeight: 'calc(100vh - 24px)',
                overflowY: 'auto',
                padding: 5,
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
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                onClick={() => {
                  onFlipLayerH();
                  onClose();
                }}
              >
                Flip Horizontal
              </button>
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                onClick={() => {
                  onFlipLayerV();
                  onClose();
                }}
              >
                Flip Vertical
              </button>
              {canRotate && (
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                  onClick={() => {
                    onRotateLayer90();
                    onClose();
                  }}
                >
                  Rotate 90° CW
                </button>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '2px 4px' }} />
              <button
                type="button"
                role="menuitem"
                className="btn"
                style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                onClick={() => {
                  onResizeLayer();
                  onClose();
                }}
              >
                Resize Layer
              </button>
            </div>
          </div>
        )}
      </div>

      {(hasSelection || hasClipboard) && (
        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => {
            setSelSubOpen(true);
            setColorSubOpen(false);
            setTransformSubOpen(false);
          }}
          onMouseLeave={() => setSelSubOpen(false)}
        >
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={selSubOpen}
            className="btn"
            style={{ width: '100%', border: 'none', justifyContent: 'space-between', fontSize: 12.5 }}
            onClick={() => setSelSubOpen((v) => !v)}
          >
            <span>Selection</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
          </button>

          {selSubOpen && (
            <div
              style={{
                position: 'absolute',
                ...subPosStyle,
                zIndex: 71,
              }}
            >
              <div
                role="menu"
                className="floating-card menu-pop"
                style={{
                  width: 164,
                  maxHeight: 'calc(100vh - 24px)',
                  overflowY: 'auto',
                  padding: 5,
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  transformOrigin: 'top left',
                }}
              >
                {hasSelection && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        onCut();
                        onClose();
                      }}
                    >
                      Cut
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        onCopy();
                        onClose();
                      }}
                    >
                      Copy
                    </button>
                  </>
                )}
                {hasClipboard && (
                  <button
                    type="button"
                    role="menuitem"
                    className="btn"
                    style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                    onClick={() => {
                      onPaste();
                      onClose();
                    }}
                  >
                    Paste
                  </button>
                )}
                {hasSelection && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        onFlipH();
                        onClose();
                      }}
                    >
                      Flip Horizontal
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        onFlipV();
                        onClose();
                      }}
                    >
                      Flip Vertical
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        onRotate90();
                        onClose();
                      }}
                    >
                      Rotate 90°
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        onDeselect();
                        onClose();
                      }}
                    >
                      Deselect
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
