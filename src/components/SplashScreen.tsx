import { useEffect } from 'react';

export function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(onDone, reduced ? 0 : 900);
    const onSkip = () => onDone();
    window.addEventListener('keydown', onSkip);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onSkip);
    };
  }, [onDone]);

  const grid = [
    [0, 1, 1, 0],
    [1, 2, 2, 1],
    [1, 2, 1, 1],
    [1, 0, 0, 1],
  ];

  return (
    <div
      onClick={onDone}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--canvas-void)',
        cursor: 'pointer',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 14px)',
          gap: '3px',
          marginBottom: 18,
        }}
      >
        {grid.flat().map((v, idx) => (
          <div
            key={idx}
            style={{
              width: 14,
              height: 14,
              background:
                v === 2
                  ? 'var(--accent)'
                  : v === 1
                    ? 'var(--text-primary)'
                    : 'transparent',
            }}
          />
        ))}
      </div>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.6px' }}>
        ArtoPixel
      </h1>
    </div>
  );
}
