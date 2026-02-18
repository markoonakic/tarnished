export interface ThemeColors {
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  fg0: string;
  fg1: string;
  fg2: string;
  fg3: string;
  fg4: string;
  accent: string;
  accent_bright: string;
  red: string;
  green: string;
}

export interface UserSettings {
  theme: string;
  accent: string;
  colors: ThemeColors;
}

// Default fallback colors (Gruvbox Dark + aqua)
export const DEFAULT_COLORS: ThemeColors = {
  bg0: '#1d2021',
  bg1: '#282828',
  bg2: '#3c3836',
  bg3: '#504945',
  bg4: '#665c54',
  fg0: '#fbf1c7',
  fg1: '#ebdbb2',
  fg2: '#d5c4a1',
  fg3: '#bdae93',
  fg4: '#a89984',
  accent: '#689d6a',
  accent_bright: '#8ec07c',
  red: '#fb4934',
  green: '#b8bb26',
};
