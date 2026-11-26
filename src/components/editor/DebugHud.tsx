import { MirrorMode, PixelTool } from '../../engine/types';

export interface DebugHudProps {
  zoomPct: number;
  tool: PixelTool;
  pixelPerfect: boolean;
  mirror: MirrorMode;
  tiledMode: boolean;
  tabsOpen: boolean;
  collapsedLeft: number;
  onResetZoom: () => void;
}

export function DebugHud({
  zoomPct,
  tool,
  pixelPerfect,
  mirror,
  tiledMode,
  tabsOpen,
  collapsedLeft,
  onResetZoom,
}: DebugHudProps) {
  return (
    <div
      aria-live="polite"
      className="mono ui-scaled debug-hud-shift"
      style={{
        position: 'absolute',
        top: tabsOpen ? 41 : 7,
        left: tabsOpen ? 12 : collapsedLeft,
        zIndex: 31,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
      }}
    >
      <button
        type="button"
        className="hud-pill"
        onClick={onResetZoom}
        title="Click to reset zoom to 100%"
        style={{
          pointerEvents: 'auto',
          width: 48,
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-primary)',
          font: 'inherit',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {zoomPct}%
      </button>
      <div
        className="hud-pill"
        style={{
          gap: 6,
          padding: '0 8px',
        }}
      >
        <span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
          {tool}
        </span>
        {(tool === 'pencil' || tool === 'shade') && pixelPerfect && (
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
            • Pixel Perfect
          </span>
        )}
        {mirror !== 'none' && (
          <span style={{ color: 'var(--text-secondary)' }}>
            • Mirror: {mirror}
          </span>
        )}
        {tiledMode && (
          <span style={{ color: 'var(--text-secondary)' }}>
            • Tiled
          </span>
        )}
      </div>
    </div>
  );
}
