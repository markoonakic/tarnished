import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ActivityHeatmap from './ActivityHeatmap';
import i18n from '@/lib/i18n';

const { heatmap } = vi.hoisted(() => ({ heatmap: vi.fn() }));
vi.mock('@/hooks/useAnalyticsData', () => ({ useHeatmapAnalytics: heatmap }));
vi.mock('@/hooks/useEffectiveDayKey', () => ({
  useEffectiveDayKey: () => '2026-10-01',
  getDatePartsFromKey: (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return { year, month, day };
  },
}));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
  vi.restoreAllMocks();
});
it('starts the loaded mobile scroller at the recent end without resetting a user scroll on rerender', () => {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(825);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(310);
  heatmap.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  const view = render(<ActivityHeatmap />);
  heatmap.mockReturnValue({
    data: { days: [{ date: '2026-10-01', count: 1 }], max_count: 1 },
    isLoading: false,
    isError: false,
  });
  view.rerender(<ActivityHeatmap />);
  const scroller =
    view.container.querySelector<HTMLDivElement>('.overflow-x-auto')!;
  expect(scroller.scrollLeft).toBe(825);
  expect(screen.getByText('Scroll for earlier months')).toBeVisible();
  scroller.scrollLeft = 100;
  view.rerender(<ActivityHeatmap />);
  expect(scroller.scrollLeft).toBe(100);
});
it('labels calendar months without applying a UTC offset', () => {
  heatmap.mockReturnValue({
    data: { days: [{ date: '2026-01-01', count: 1 }], max_count: 1 },
    isLoading: false,
    isError: false,
  });
  render(<ActivityHeatmap />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Select time range' }));
  fireEvent.click(screen.getByRole('option', { name: '2026' }));
  expect(
    screen.getAllByText(
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/
    )[0]
  ).toHaveTextContent('Jan');
  expect(
    screen.getByRole('img', { name: '1 application on 1/1/2026' })
  ).toBeVisible();
});
it('uses Serbian dates and plurals without changing calendar keys', async () => {
  await i18n.changeLanguage('sr-Latn');
  heatmap.mockReturnValue({
    data: { days: [{ date: '2026-10-01', count: 2 }], max_count: 2 },
    isLoading: false,
    isError: false,
  });
  render(<ActivityHeatmap />);
  const cell = screen.getByRole('img', { name: '2 prijave dana 1. 10. 2026.' });
  fireEvent.mouseEnter(cell);
  expect(screen.getByText('1. 10. 2026.')).toBeVisible();
});
it('does not add a scroll hint when the grid fits', () => {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(825);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  heatmap.mockReturnValue({
    data: { days: [{ date: '2026-10-01', count: 1 }], max_count: 1 },
    isLoading: false,
    isError: false,
  });
  const view = render(<ActivityHeatmap />);
  expect(view.container.querySelector('.overflow-x-auto')!.scrollLeft).toBe(0);
  expect(
    screen.queryByText('Scroll for earlier months')
  ).not.toBeInTheDocument();
});
