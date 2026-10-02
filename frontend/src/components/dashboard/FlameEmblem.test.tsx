import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import FlameEmblem from './FlameEmblem';

const state = vi.hoisted(() => ({ theme: 'gruvbox-dark', day: '2026-10-02' }));
vi.mock('@/contexts/ThemeContext', () => {
  const accentOptions = [
    { name: 'aqua', cssVar: '--aqua', cssVarBright: '--aqua-bright' },
  ];
  return {
    useTheme: () => ({
      currentTheme: state.theme,
      currentAccent: 'aqua',
      accentOptions,
    }),
  };
});
vi.mock('@/hooks/useEffectiveDayKey', () => ({
  useEffectiveDayKey: () => state.day,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(({ queryKey }) => ({
    data:
      queryKey[0] === 'streak'
        ? {
            state: 'dormant',
            current_streak: 0,
            longest_streak: 0,
            total_activity_days: 0,
            streak_exhausted_at: null,
          }
        : {
            width: 1,
            height: 1,
            frames: [{ duration: 33, data: { '0,0': { char: '+' } } }],
          },
  })),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('style');
});

it('updates the flame palette after a theme change and its query after midnight', () => {
  const context = { clearRect: vi.fn(), fillText: vi.fn(), fillStyle: '' };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  document.documentElement.style.setProperty('--aqua', '#123456');
  document.documentElement.style.setProperty('--aqua-bright', '#234567');
  const view = render(<FlameEmblem />);
  expect(context.fillStyle).toBe('#123456');
  document.documentElement.style.setProperty('--aqua', '#abcdef');
  state.theme = 'dracula';
  state.day = '2026-10-03';
  view.rerender(<FlameEmblem />);
  expect(context.fillStyle).toBe('#abcdef');
  expect(useQuery).toHaveBeenCalledWith(
    expect.objectContaining({ queryKey: ['streak', '2026-10-03'] })
  );
});
