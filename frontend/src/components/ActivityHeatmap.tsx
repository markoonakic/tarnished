import { t, uiLabel, locale } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useMemo, useState } from 'react';
import { useHeatmapAnalytics } from '@/hooks/useAnalyticsData';
import {
  getDatePartsFromKey,
  useEffectiveDayKey,
} from '@/hooks/useEffectiveDayKey';
import { useThemeColors } from '@/hooks/useThemeColors';
import Dropdown from './Dropdown';
import Loading from './Loading';
import EmptyState from './EmptyState';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function displayDate(day: string): string {
  return new Date(day).toLocaleDateString(locale(), { timeZone: 'UTC' });
}

interface CellData {
  date: string;
  count: number;
  level: number;
  isPadding?: boolean;
}

export default function ActivityHeatmap() {
  useTranslation();
  const [viewMode, setViewMode] = useState<'rolling' | number>('rolling');
  const [hoveredCell, setHoveredCell] = useState<CellData | null>(null);
  const colors = useThemeColors();
  const dayKey = useEffectiveDayKey();

  const { data, isLoading, isError } = useHeatmapAnalytics(viewMode);
  const [scrollable, setScrollable] = useState(false);
  const scrollToRecent = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const overflowing = node.scrollWidth > node.clientWidth;
    setScrollable(overflowing);
    if (overflowing) node.scrollLeft = node.scrollWidth;
  }, []);

  const effectiveToday = useMemo(() => {
    const { year, month, day } = getDatePartsFromKey(dayKey);
    return new Date(year, month - 1, day);
  }, [dayKey]);

  const currentYear = effectiveToday.getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  function getLevel(count: number, maxCount: number): number {
    if (count === 0) return 0;
    if (maxCount === 0) return 0;
    const ratio = count / maxCount;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  }

  function getLevelColor(level: number): string {
    switch (level) {
      case 0:
        return colors.bg2;
      case 1:
        return colors.green;
      case 2:
        return colors.aqua;
      case 3:
        return colors.blue;
      case 4:
        return colors.aquaBright;
      default:
        return colors.bg2;
    }
  }

  function buildGrid(): CellData[][] {
    const grid: CellData[][] = [];
    const countMap = new Map<string, number>();

    if (data && data.days) {
      data.days.forEach((d) => countMap.set(d.date, d.count));
    }

    const today = new Date(effectiveToday);
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    let endDate: Date;

    if (viewMode === 'rolling') {
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 365);
      endDate = new Date(today);
    } else {
      startDate = new Date(viewMode, 0, 1); // Jan 1
      endDate = new Date(viewMode, 11, 31); // Dec 31
    }

    // Align the first column to Sunday.
    const gridStart = new Date(startDate);
    const startDayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    gridStart.setDate(startDate.getDate() - startDayOfWeek);

    const currentDate = new Date(gridStart);

    while (currentDate <= endDate) {
      const weekData: CellData[] = [];

      for (let i = 0; i < 7; i++) {
        const cellDate = new Date(currentDate);
        cellDate.setDate(currentDate.getDate() + i);
        cellDate.setHours(0, 0, 0, 0);

        if (cellDate >= startDate && cellDate <= endDate) {
          const dateStr = cellDate.toLocaleDateString('en-CA');
          const count = countMap.get(dateStr) || 0;
          const level = getLevel(count, data?.max_count ?? 0);
          weekData.push({ date: dateStr, count, level });
        } else {
          weekData.push({
            date: cellDate.toLocaleDateString('en-CA'),
            count: 0,
            level: 0,
            isPadding: true,
          });
        }
      }

      const hasRealData = weekData.some((cell) => !cell.isPadding);
      if (hasRealData) {
        grid.push(weekData);
      }

      currentDate.setDate(currentDate.getDate() + 7);
    }

    return grid;
  }

  function getMonthLabels(
    grid: CellData[][]
  ): { label: string; week: number }[] {
    const labels: { label: string; week: number }[] = [];
    const seenMonths = new Set<string>();

    grid.forEach((week, weekIndex) => {
      if (week.length === 0) return;

      const firstRealCell = week.find((cell) => !cell.isPadding);
      if (!firstRealCell) return;

      const { year, month: calendarMonth } = getDatePartsFromKey(
        firstRealCell.date
      );
      const month = calendarMonth - 1;

      // Show each month once in the rolling view.
      const monthKey =
        viewMode === 'rolling' ? String(month) : `${year}-${month}`;

      if (!seenMonths.has(monthKey)) {
        labels.push({ label: MONTH_LABELS[month], week: weekIndex });
        seenMonths.add(monthKey);
      }
    });

    return labels;
  }

  if (isLoading) {
    return <Loading message={t('Loading chart data...')} size="sm" />;
  }

  if (isError) {
    return (
      <div className="text-red-bright py-8 text-center">
        {t('Failed to load activity data')}
      </div>
    );
  }

  const grid = buildGrid();
  const monthLabels = getMonthLabels(grid);
  const cellSize = 12;
  const cellGap = 3;
  const gridWeeks = grid.length;

  if (!data || !data.days || data.days.length === 0 || data.max_count === 0) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dropdown
              options={[
                { value: 'rolling', label: t('Last 12 months') },
                ...years.map((y) => ({ value: String(y), label: String(y) })),
              ]}
              value={typeof viewMode === 'string' ? viewMode : String(viewMode)}
              onChange={(value) =>
                setViewMode(value === 'rolling' ? 'rolling' : parseInt(value))
              }
              placeholder={t('Select time range')}
              size="sm"
              containerBackground="bg1"
            />
          </div>
        </div>
        <EmptyState
          message={t(
            'Not enough data for visualization. Add more applications with different statuses.'
          )}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dropdown
            options={[
              { value: 'rolling', label: t('Last 12 months') },
              ...years.map((y) => ({ value: String(y), label: String(y) })),
            ]}
            value={typeof viewMode === 'string' ? viewMode : String(viewMode)}
            onChange={(value) =>
              setViewMode(value === 'rolling' ? 'rolling' : parseInt(value))
            }
            placeholder={t('Select time range')}
            size="sm"
            containerBackground="bg1"
          />
        </div>
        <div className="text-muted flex items-center gap-2 text-sm">
          <span>{t('Less')}</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: getLevelColor(level) }}
            />
          ))}
          <span>{t('More')}</span>
        </div>
      </div>

      <div ref={scrollToRecent} className="overflow-x-auto">
        <div
          className="relative"
          style={{ minWidth: gridWeeks * (cellSize + cellGap) + 30 }}
        >
          <div className="text-muted mb-1 flex pl-8 text-xs">
            {monthLabels.map((m, i) => (
              <span
                key={`${uiLabel(m.label)}-${i}`}
                style={{
                  position: 'absolute',
                  left: 30 + m.week * (cellSize + cellGap),
                }}
              >
                {uiLabel(m.label)}
              </span>
            ))}
          </div>

          <div className="mt-4 flex">
            <div
              className="text-muted flex flex-col pr-2 text-xs"
              style={{ marginTop: 0 }}
            >
              {DAY_LABELS.map((label, i) => (
                <div
                  key={uiLabel(label)}
                  style={{
                    height: cellSize + cellGap,
                    lineHeight: `${cellSize}px`,
                  }}
                  className={i % 2 === 1 ? '' : 'invisible'}
                >
                  {uiLabel(label)}
                </div>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {grid.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[3px]">
                  {week.map((cell, dayIndex) => (
                    <div
                      key={`${weekIndex}-${dayIndex}`}
                      role={cell.isPadding ? undefined : 'img'}
                      aria-label={
                        cell.isPadding
                          ? undefined
                          : t('{{count}} {{value0}} on {{date}}', {
                              count: cell.count,
                              value0: t('applicationNoun', {
                                count: cell.count,
                              }),
                              date: displayDate(cell.date),
                            })
                      }
                      className="cursor-pointer rounded-sm opacity-60 transition-all duration-200 ease-in-out hover:opacity-100"
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: getLevelColor(cell.level),
                        visibility: cell.isPadding ? 'hidden' : 'visible',
                      }}
                      onMouseEnter={() =>
                        !cell.isPadding && setHoveredCell(cell)
                      }
                      onMouseLeave={() => setHoveredCell(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {hoveredCell && (
            <div className="bg-secondary border-tertiary absolute top-0 right-0 rounded border px-2 py-1 text-sm">
              <span className="text-primary font-medium">
                {hoveredCell.count}
              </span>
              <span className="text-muted ml-1">
                {t('applicationNoun', { count: hoveredCell.count })}{' '}
                {t('on')}{' '}
              </span>
              <span className="text-primary">
                {displayDate(hoveredCell.date)}
              </span>
            </div>
          )}
        </div>
      </div>
      {scrollable && (
        <p className="text-fg2 mt-2 text-xs">
          {t('Scroll for earlier months')}
        </p>
      )}
    </div>
  );
}
