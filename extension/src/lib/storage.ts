import browser from 'webextension-polyfill';
import { DEFAULT_COLORS, type ThemeColors } from './theme';

const THEME_SETTINGS_STORAGE_KEY = 'themeSettings';
const AUTO_FILL_ON_LOAD_STORAGE_KEY = 'autoFillOnLoad';

export interface Settings {
  appUrl: string;
  apiKey: string;
}

export async function getSettings(): Promise<Settings> {
  const result = (await browser.storage.local.get([
    'appUrl',
    'apiKey',
  ])) as Partial<Settings>;
  return { appUrl: result.appUrl || '', apiKey: result.apiKey || '' };
}

export async function setSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set(
    settings as unknown as Record<string, unknown>
  );
}

export async function getAutoFillOnLoad(): Promise<boolean> {
  const result = await browser.storage.local.get(AUTO_FILL_ON_LOAD_STORAGE_KEY);
  return result[AUTO_FILL_ON_LOAD_STORAGE_KEY] === true;
}

export async function setAutoFillOnLoad(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [AUTO_FILL_ON_LOAD_STORAGE_KEY]: enabled });
}

export async function getThemeColorsCache(): Promise<ThemeColors> {
  const result = (await browser.storage.local.get(
    THEME_SETTINGS_STORAGE_KEY
  )) as Record<string, ThemeColors>;
  return result[THEME_SETTINGS_STORAGE_KEY] || DEFAULT_COLORS;
}

export async function setThemeColorsCache(colors: ThemeColors): Promise<void> {
  await browser.storage.local.set({ [THEME_SETTINGS_STORAGE_KEY]: colors });
}
