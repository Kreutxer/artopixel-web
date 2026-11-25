import { useLayoutEffect, useState } from 'react';
import { EditorScreen } from './components/EditorScreen';
import { MainMenu } from './components/MainMenu';
import { SplashScreen } from './components/SplashScreen';
import { loadThemePreference, saveThemePreference } from './engine/storage';
import { PixelProject } from './engine/types';

export function App() {
  const [screen, setScreen] = useState<'splash' | 'menu' | 'editor'>('splash');
  const [activeProject, setActiveProject] = useState<PixelProject | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    loadThemePreference()
  );
  const [uiScale, setUiScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('artopixel_ui_scale_v1');
      if (saved) {
        const n = Number(saved);
        if (!Number.isNaN(n) && n >= 0.9 && n <= 1.5) return n;
      }
    } catch {
      // ignore
    }
    return 1;
  });

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);

  const handleChangeUiScale = (next: number) => {
    const clamped = Math.max(0.9, Math.min(1.5, Math.round(next * 100) / 100));
    setUiScale(clamped);
    try {
      localStorage.setItem('artopixel_ui_scale_v1', String(clamped));
    } catch {
      // ignore
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      saveThemePreference(next);
      return next;
    });
  };

  if (screen === 'splash') {
    return <SplashScreen onDone={() => setScreen('menu')} />;
  }

  if (screen === 'editor' && activeProject) {
    return (
      <EditorScreen
        initialProject={activeProject}
        theme={theme}
        uiScale={uiScale}
        onChangeUiScale={handleChangeUiScale}
        onToggleTheme={toggleTheme}
        onBack={() => {
          setActiveProject(null);
          setScreen('menu');
        }}
      />
    );
  }

  return (
    <MainMenu
      theme={theme}
      onToggleTheme={toggleTheme}
      onOpenProject={(p) => {
        setActiveProject(p);
        setScreen('editor');
      }}
    />
  );
}
