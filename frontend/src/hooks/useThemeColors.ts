import { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export interface ThemeColors {
  bg0Hard: string;
  bg0: string;
  bg0Soft: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  bgH: string;
  fg0: string;
  fg1: string;
  fg2: string;
  fg3: string;
  fg4: string;
  gray: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  purple: string;
  aqua: string;
  orange: string;
  redBright: string;
  greenBright: string;
  yellowBright: string;
  blueBright: string;
  purpleBright: string;
  aquaBright: string;
  orangeBright: string;
}

const CSS_VAR_MAP: [keyof ThemeColors, string][] = [
  ['bg0Hard', '--bg0-hard'],
  ['bg0', '--bg0'],
  ['bg0Soft', '--bg0-soft'],
  ['bg1', '--bg1'],
  ['bg2', '--bg2'],
  ['bg3', '--bg3'],
  ['bg4', '--bg4'],
  ['bgH', '--bg-h'],
  ['fg0', '--fg0'],
  ['fg1', '--fg1'],
  ['fg2', '--fg2'],
  ['fg3', '--fg3'],
  ['fg4', '--fg4'],
  ['gray', '--gray'],
  ['red', '--red'],
  ['green', '--green'],
  ['yellow', '--yellow'],
  ['blue', '--blue'],
  ['purple', '--purple'],
  ['aqua', '--aqua'],
  ['orange', '--orange'],
  ['redBright', '--red-bright'],
  ['greenBright', '--green-bright'],
  ['yellowBright', '--yellow-bright'],
  ['blueBright', '--blue-bright'],
  ['purpleBright', '--purple-bright'],
  ['aquaBright', '--aqua-bright'],
  ['orangeBright', '--orange-bright'],
];

function resolveColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const colors = {} as ThemeColors;
  for (const [key, cssVar] of CSS_VAR_MAP) {
    colors[key] = style.getPropertyValue(cssVar).trim();
  }
  return colors;
}

export function useThemeColors(): ThemeColors {
  const { currentTheme } = useTheme();
  const [colors, setColors] = useState<ThemeColors>(resolveColors);

  useEffect(() => {
    // Wait one frame for the DOM to update with new CSS variable values
    const id = requestAnimationFrame(() => {
      setColors(resolveColors());
    });
    return () => cancelAnimationFrame(id);
  }, [currentTheme]);

  return colors;
}
