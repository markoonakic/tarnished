import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '../lib/api';

interface Theme {
  id: string;
  name: string;
  swatches: string[];
}

interface AccentOption {
  name: string;
  cssVar: string;
  cssVarBright: string;
}

interface ThemeContextType {
  currentTheme: string;
  setTheme: (themeId: string) => void;
  themes: Theme[];
  currentAccent: string;
  setAccentColor: (colorName: string) => void;
  accentOptions: AccentOption[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEMES: Theme[] = [
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', swatches: ['#282828', '#ebdbb2', '#8ec07c', '#b8bb26', '#fb4934'] },
  { id: 'gruvbox-light', name: 'Gruvbox Light', swatches: ['#fbf1c7', '#3c3836', '#689d6a', '#98971a', '#cc241d'] },
  { id: 'catppuccin', name: 'Catppuccin', swatches: ['#1e1e2e', '#cdd6f4', '#89b4fa', '#a6e3a1', '#f38ba8'] },
  { id: 'dracula', name: 'Dracula', swatches: ['#282a36', '#f8f8f2', '#8be9fd', '#50fa7b', '#ff5555'] },
];

const ACCENT_OPTIONS: AccentOption[] = [
  { name: 'aqua', cssVar: '--aqua', cssVarBright: '--aqua-bright' },
  { name: 'green', cssVar: '--green', cssVarBright: '--green-bright' },
  { name: 'blue', cssVar: '--blue', cssVarBright: '--blue-bright' },
  { name: 'purple', cssVar: '--purple', cssVarBright: '--purple-bright' },
  { name: 'yellow', cssVar: '--yellow', cssVarBright: '--yellow-bright' },
  { name: 'orange', cssVar: '--orange', cssVarBright: '--orange-bright' },
  { name: 'red', cssVar: '--red', cssVarBright: '--red-bright' },
];

const STORAGE_KEY_ACCENTS = 'themeAccents';

function getAccentOverrides(): Record<string, string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ACCENTS);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function applyAccentColor(colorName: string) {
  const option = ACCENT_OPTIONS.find(opt => opt.name === colorName);
  if (option) {
    document.documentElement.style.setProperty('--accent', `var(${option.cssVar})`);
    document.documentElement.style.setProperty('--accent-bright', `var(${option.cssVarBright})`);
  }
}

// Fetch and update favicon with dynamic accent color
async function updateFavicon(colorHex: string) {
  try {
    const response = await fetch('/tree.svg');
    let svg = await response.text();
    svg = svg.replace(/fill="[^"]*"/g, `fill="${colorHex}"`);
    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      document.head.appendChild(link);
    }
    link.href = dataUrl;
  } catch {
    // Silently fail - fallback to static favicon
  }
}

function getResolvedAccentColor(colorName: string): string {
  const option = ACCENT_OPTIONS.find(opt => opt.name === colorName);
  if (!option) return '#8ec07c'; // fallback

  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue(option.cssVar).trim() || '#8ec07c';
}

function initTheme() {
  const stored = localStorage.getItem('theme') || 'gruvbox-dark';
  document.documentElement.setAttribute('data-theme', stored);

  // Apply stored accent override for the current theme
  const overrides = getAccentOverrides();
  const accentForTheme = overrides[stored] || 'aqua';
  applyAccentColor(accentForTheme);

  // Update favicon after a frame to ensure CSS vars are resolved
  requestAnimationFrame(() => {
    updateFavicon(getResolvedAccentColor(accentForTheme));
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('theme') || 'gruvbox-dark';
  });

  const [accentOverrides, setAccentOverrides] = useState<Record<string, string>>(() => {
    return getAccentOverrides();
  });

  useEffect(() => {
    // Initialize theme before React render
    initTheme();
  }, []);

  // Sync theme settings to backend
  const syncSettingsToBackend = useCallback(async (theme: string, accent: string) => {
    try {
      await api.patch('/api/users/settings', { theme, accent });
    } catch (error) {
      // Silent fail - backend sync is nice-to-have, not critical
      console.warn('Failed to sync theme settings to backend:', error);
    }
  }, []);

  const setTheme = useCallback((themeId: string) => {
    localStorage.setItem('theme', themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    setCurrentTheme(themeId);

    // Apply stored accent override for the new theme
    const accentForTheme = accentOverrides[themeId] || 'aqua';
    applyAccentColor(accentForTheme);

    // Update favicon after CSS vars resolve
    requestAnimationFrame(() => {
      updateFavicon(getResolvedAccentColor(accentForTheme));
    });

    // Sync to backend
    syncSettingsToBackend(themeId, accentForTheme);
  }, [accentOverrides, syncSettingsToBackend]);

  const setAccentColor = useCallback((colorName: string) => {
    // Update localStorage
    const newOverrides = { ...accentOverrides, [currentTheme]: colorName };
    localStorage.setItem(STORAGE_KEY_ACCENTS, JSON.stringify(newOverrides));
    setAccentOverrides(newOverrides);

    // Apply immediately via CSS custom properties
    applyAccentColor(colorName);

    // Update favicon after CSS vars resolve
    requestAnimationFrame(() => {
      updateFavicon(getResolvedAccentColor(colorName));
    });

    // Sync to backend
    syncSettingsToBackend(currentTheme, colorName);
  }, [currentTheme, accentOverrides, syncSettingsToBackend]);

  const currentAccent = accentOverrides[currentTheme] || 'aqua';

  return (
    <ThemeContext.Provider value={{
      currentTheme,
      setTheme,
      themes: THEMES,
      currentAccent,
      setAccentColor,
      accentOptions: ACCENT_OPTIONS,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
