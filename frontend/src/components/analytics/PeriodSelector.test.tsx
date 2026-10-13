import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PeriodSelector from './PeriodSelector';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));

afterEach(cleanup);

function Location() {
  return <output>{useLocation().search}</output>;
}

describe('PeriodSelector', () => {
  it('marks only the selected period and keeps unrelated URL filters', () => {
    const changed = vi.fn();
    render(
      <MemoryRouter initialEntries={['/analytics?period=30d&as_of=2026-10-12']}>
        <PeriodSelector onPeriodChange={changed} />
        <Location />
      </MemoryRouter>
    );
    const selected = screen.getByRole('button', { name: '30d' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected).toHaveAttribute('data-variant', 'primary');
    const all = screen.getByRole('button', { name: 'All' });
    expect(all).toHaveAttribute('aria-pressed', 'false');
    expect(all).toHaveAttribute('data-variant', 'ghost');
    fireEvent.click(all);
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('data-variant', 'primary');
    expect(selected).toHaveAttribute('data-variant', 'ghost');
    expect(screen.getByRole('status')).toHaveTextContent(
      '?period=all&as_of=2026-10-12'
    );
    expect(changed).toHaveBeenCalledExactlyOnceWith('all');
  });

  it('shows the default 7d period as selected', () => {
    render(
      <MemoryRouter>
        <PeriodSelector />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
    ).toHaveLength(1);
  });
});
