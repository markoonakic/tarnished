import browser from 'webextension-polyfill';
import { ThemeColors, DEFAULT_COLORS } from './theme';

const SETTINGS_STORAGE_KEY = 'themeSettings';

export async function getThemeColors(): Promise<ThemeColors> {
  const cached = await browser.storage.local.get(SETTINGS_STORAGE_KEY) as Record<string, ThemeColors>;
  return cached[SETTINGS_STORAGE_KEY] || DEFAULT_COLORS;
}

export function applyThemeToDocument(colors: ThemeColors): void {
  const root = document.documentElement;

  root.style.setProperty('--bg0', colors.bg0);
  root.style.setProperty('--bg1', colors.bg1);
  root.style.setProperty('--bg2', colors.bg2);
  root.style.setProperty('--bg3', colors.bg3);
  root.style.setProperty('--bg4', colors.bg4);

  root.style.setProperty('--fg0', colors.fg0);
  root.style.setProperty('--fg1', colors.fg1);
  root.style.setProperty('--fg2', colors.fg2);
  root.style.setProperty('--fg3', colors.fg3);
  root.style.setProperty('--fg4', colors.fg4);

  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--accent-bright', colors.accent_bright);

  root.style.setProperty('--red', colors.red);
  root.style.setProperty('--green', colors.green);
}

export { SETTINGS_STORAGE_KEY };
