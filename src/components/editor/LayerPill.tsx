import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Contrast, Eye, EyeOff } from 'lucide-react';
import { PixelLayer } from '../../engine/types';
import { useEscapeKey } from '../../hooks/useEscapeKey';

export function LayerPill({
  layers,
  activeLayerIndex,
  topOffset,
  dimOtherLayers = false,
  onToggleDimOthers,
  onToggleVisibility,
  onSetOpacity,
  onSelectLayer,
}: {
  layers: PixelLayer[];
  activeLayerIndex: number;
  topOffset: number;
  dimOtherLayers?: boolean;
  onToggleDimOthers?: () => void;
  onToggleVisibility: () => void;
  onSetOpacity: (opacity: number) => void;
  onSelectLayer: (idx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const activeLayer = layers[activeLayerIndex];

  useEscapeKey(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (!activeLayer) return null;

  return (
    <div
      ref={pillRef}
      className="ui-scaled"
      style={{
        position: 'absolute',
        top: topOffset,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 28,
      }}
    >
      <div
        className="floating-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '2px 4px 2px 8px',
          borderRadius: 999,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`Active layer: ${activeLayer.name}. Click for opacity and layer switcher`}
          title="Click for Opacity & Layer Switcher"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 11,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 3px',
            cursor: 'pointer',
            maxWidth: 136,
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeLayer.name}
          </span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {Math.round(activeLayer.opacity * 100)}%
          </span>
          <ChevronDown size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </button>
        {onToggleDimOthers && (
          <button
            type="button"
            className={`icon-btn ${dimOtherLayers ? 'active' : ''}`}
            style={{ width: 24, height: 24, borderRadius: '50%' }}
            aria-label={dimOtherLayers ? 'Show all layers at full opacity' : 'Dim other layers'}
            aria-pressed={dimOtherLayers}
            title={dimOtherLayers ? 'Dim other layers: On' : 'Dim other layers: Off'}
            onClick={onToggleDimOthers}
          >
            <Contrast size={12} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          style={{ width: 24, height: 24, borderRadius: '50%' }}
          aria-label={activeLayer.visible ? 'Hide active layer' : 'Show active layer'}
          title={activeLayer.visible ? 'Hide layer' : 'Show layer'}
          onClick={onToggleVisibility}
        >
          {activeLayer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
          }}
        >
          <div
            className="floating-card menu-pop"
            style={{
              width: 224,
              padding: 10,
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              transformOrigin: 'top center',
            }}
          >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Opacity
            </span>
            <input
              type="range"
              aria-label="Active layer opacity"
              className="color-slider"
              min={0}
              max={1}
              step={0.01}
              value={activeLayer.opacity}
              onChange={(e) => onSetOpacity(parseFloat(e.target.value))}
              style={{
                flex: 1,
                minWidth: 0,
                height: 10,
                background: `linear-gradient(to right, var(--accent) ${Math.round(activeLayer.opacity * 100)}%, var(--surface-elevated) ${Math.round(activeLayer.opacity * 100)}%)`,
              }}
            />
            <span className="mono" style={{ fontSize: 11, minWidth: 32, textAlign: 'right' }}>
              {Math.round(activeLayer.opacity * 100)}%
            </span>
          </div>

          {layers.length > 1 && (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                maxHeight: 150,
                overflowY: 'auto',
              }}
            >
              {[...layers].reverse().map((lay, revIdx) => {
                const actualIdx = layers.length - 1 - revIdx;
                const isCur = actualIdx === activeLayerIndex;
                return (
                  <button
                    key={lay.id}
                    type="button"
                    className={`btn ${isCur ? 'primary' : ''}`}
                    style={{
                      border: 'none',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      fontSize: 12,
                    }}
                    onClick={() => {
                      onSelectLayer(actualIdx);
                      setOpen(false);
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lay.name}
                    </span>
                    {!lay.visible && <EyeOff size={12} style={{ opacity: 0.65, flexShrink: 0 }} />}
                  </button>
                );
              })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
