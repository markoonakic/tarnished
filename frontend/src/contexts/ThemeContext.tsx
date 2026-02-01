import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Theme {
  id: string;
  name: string;
  swatches: string[];
}

interface ThemeContextType {
  currentTheme: string;
  setTheme: (themeId: string) => void;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEMES: Theme[] = [
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', swatches: ['#282828', '#ebdbb2', '#8ec07c', '#b8bb26', '#fb4934'] },
  { id: 'gruvbox-light', name: 'Gruvbox Light', swatches: ['#fbf1c7', '#3c3836', '#689d6a', '#98971a', '#cc241d'] },
  { id: 'nord', name: 'Nord', swatches: ['#2e3440', '#eceff4', '#88c0d0', '#a3be8c', '#bf616a'] },
  { id: 'dracula', name: 'Dracula', swatches: ['#282a36', '#f8f8f2', '#8be9fd', '#50fa7b', '#ff5555'] },
];

function initTheme() {
  const stored = localStorage.getItem('theme');
  if (stored && stored !== 'gruvbox-dark') {
    document.documentElement.setAttribute('data-theme', stored);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('theme') || 'gruvbox-dark';
  });

  useEffect(() => {
    // Initialize theme before React render
    initTheme();
  }, []);

  const setTheme = (themeId: string) => {
    localStorage.setItem('theme', themeId);
    if (themeId === 'gruvbox-dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', themeId);
    }
    setCurrentTheme(themeId);
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
