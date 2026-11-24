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

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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
