import type { ThemeColors } from '../lib/theme';

export async function fetchRuntimeText(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

export async function updatePopupFavicon(options: {
  accentColor: string;
  document: Document;
  getRuntimeUrl: (path: string) => string;
  fetchText: (url: string) => Promise<string>;
  debug: (context: string, ...args: unknown[]) => void;
  warn: (context: string, ...args: unknown[]) => void;
}): Promise<void> {
  const { accentColor, document, getRuntimeUrl, fetchText, debug, warn } =
    options;

  try {
    const svgUrl = getRuntimeUrl('icons/tree.svg');
    let svg = await fetchText(svgUrl);
    svg = svg.replace(/fill="[^"]*"/g, `fill="${accentColor}"`);

    const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const favicon = document.querySelector(
      'link[rel="icon"]'
    ) as HTMLLinkElement | null;
    if (favicon) {
      favicon.href = svgDataUrl;
    }

    debug('Popup', 'Updated favicon with accent color:', accentColor);
  } catch (error) {
    warn('Popup', 'Failed to update favicon:', error);
  }
}

export async function applyPopupTheme(options: {
  getThemeColors: () => Promise<ThemeColors>;
  applyThemeToDocument: (colors: ThemeColors) => void;
  updateFavicon: (accentColor: string) => Promise<void>;
  refreshTheme: () => void;
  debug: (context: string, ...args: unknown[]) => void;
  warn: (context: string, ...args: unknown[]) => void;
  rootStyle: { getPropertyValue: (property: string) => string };
}): Promise<void> {
  const {
    getThemeColors,
    applyThemeToDocument,
    updateFavicon,
    refreshTheme,
    debug,
    warn,
    rootStyle,
  } = options;

  try {
    const colors = await getThemeColors();
    debug('Popup', 'Theme colors loaded:', colors);
    applyThemeToDocument(colors);
    debug('Popup', 'Applied theme, accent:', colors.accent);
    await updateFavicon(colors.accent);
    debug('Popup', 'CSS var --accent:', rootStyle.getPropertyValue('--accent'));
  } catch (error) {
    warn('Popup', 'Failed to load theme:', error);
  }

  refreshTheme();
}
