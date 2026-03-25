export const DEFAULT_THEME_ID = 'gruvbox-dark';
export const STORAGE_KEY_ACCENTS = 'themeAccents';
export const STORAGE_KEY_THEME = 'theme';

export function getStoredTheme(): string {
  return localStorage.getItem(STORAGE_KEY_THEME) || DEFAULT_THEME_ID;
}

export function persistThemeSelection(themeId: string): void {
  localStorage.setItem(STORAGE_KEY_THEME, themeId);
}

export function getAccentOverrides(): Record<string, string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ACCENTS);
    return stored ? (JSON.parse(stored) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function persistAccentOverrides(
  overrides: Record<string, string>
): void {
  localStorage.setItem(STORAGE_KEY_ACCENTS, JSON.stringify(overrides));
}

export async function updateThemeFavicon(colorHex: string): Promise<void> {
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
}
