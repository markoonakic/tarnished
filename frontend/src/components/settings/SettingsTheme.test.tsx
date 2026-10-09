import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import i18n, { t } from '@/lib/i18n';
import SettingsTheme from './SettingsTheme';

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    currentTheme: 'gruvbox-dark',
    setTheme: vi.fn(),
    themes: [{ id: 'gruvbox-dark', name: 'Gruvbox Dark', swatches: [] }],
    currentAccent: 'green',
    setAccentColor: vi.fn(),
    accentOptions: [{ name: 'green', cssVar: '--green' }],
  }),
}));
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

it.each(['en', 'sr-Latn'])(
  'keeps theme and accent instructions in help tips in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    render(
      <MemoryRouter>
        <SettingsTheme />
      </MemoryRouter>
    );
    for (const [label, copy] of [
      ['About theme', 'Choose your preferred color theme for the application.'],
      [
        'About accent color',
        'Choose the accent color for buttons, links, and focus indicators.',
      ],
    ]) {
      expect(screen.queryByText(t(copy))).not.toBeInTheDocument();
      const button = screen.getByRole('button', { name: t(label) });
      fireEvent.focus(button);
      expect(screen.getByRole('tooltip')).toHaveTextContent(t(copy));
      fireEvent.blur(button);
    }
  }
);
