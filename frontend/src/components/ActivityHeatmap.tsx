import { useEffect, useState } from 'react';
import { getHeatmapData } from '../lib/analytics';
import type { HeatmapData } from '../lib/analytics';
import Dropdown from './Dropdown';
import Loading from './Loading';
import EmptyState from './EmptyState';

const DAYS_IN_WEEK = 7;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface CellData {
  date: string;
  count: number;
  level: number;
  isPadding?: boolean;  // Marks cells that are for alignment only (not real dates)
}

export default function ActivityHeatmap() {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'rolling' | number>('rolling');
  const [hoveredCell, setHoveredCell] = useState<CellData | null>(null);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  useEffect(() => {
    loadData();
  }, [viewMode]);

  async function loadData() {
    setLoading(true);
    try {
      const result = await getHeatmapData(viewMode);
      setData(result);
    } catch {
      setError('Failed to load activity data');
    } finally {
      setLoading(false);
    }
  }

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
      case 0: return 'var(--bg2)';
      case 1: return 'var(--green)';
      case 2: return 'var(--aqua)';
      case 3: return 'var(--blue)';
      case 4: return 'var(--purple)';
      default: return 'var(--bg2)';
    }
  }

  function buildGrid(): CellData[][] {
    const grid: CellData[][] = [];
    const countMap = new Map<string, number>();

    if (data && data.days) {
      data.days.forEach((d) => countMap.set(d.date, d.count));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    let endDate: Date;

    if (viewMode === 'rolling') {
      // Exactly 365 days: from (today - 365) to today
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 365);
      endDate = new Date(today);
    } else {
      // Year view: exactly Jan 1 to Dec 31 of selected year
      startDate = new Date(viewMode, 0, 1);  // Jan 1
      endDate = new Date(viewMode, 11, 31);  // Dec 31
    }

    // Find the Sunday on or before startDate to ensure proper day-of-week alignment
    const gridStart = new Date(startDate);
    const startDayOfWeek = startDate.getDay();  // 0 = Sunday, 1 = Monday, etc.
    gridStart.setDate(startDate.getDate() - startDayOfWeek);

    // Build complete weeks starting from the Sunday before startDate
    let currentDate = new Date(gridStart);

    while (currentDate <= endDate) {
      const weekData: CellData[] = [];

      // Always add exactly 7 cells for this week (Sunday to Saturday)
      for (let i = 0; i < 7; i++) {
        const cellDate = new Date(currentDate);
        cellDate.setDate(currentDate.getDate() + i);
        cellDate.setHours(0, 0, 0, 0);

        // Check if this date is within our display range
        if (cellDate >= startDate && cellDate <= endDate) {
          const dateStr = cellDate.toLocaleDateString('en-CA');
          const count = countMap.get(dateStr) || 0;
          const level = getLevel(count, data?.max_count ?? 0);
          weekData.push({ date: dateStr, count, level });
        } else {
          // Add a padding cell to maintain alignment
          weekData.push({
            date: cellDate.toLocaleDateString('en-CA'),
            count: 0,
            level: 0,
            isPadding: true
          });
        }
      }

      // Only add week if it has at least one non-padding day
      const hasRealData = weekData.some(cell => !cell.isPadding);
      if (hasRealData) {
        grid.push(weekData);
      }

      // Move to next Sunday
      currentDate.setDate(currentDate.getDate() + 7);
    }

    return grid;
  }

  function getMonthLabels(grid: CellData[][]): { label: string; week: number }[] {
    const labels: { label: string; week: number }[] = [];
    const seenMonths = new Set<string>();

    grid.forEach((week, weekIndex) => {
      if (week.length === 0) return;

      const firstDayOfWeek = new Date(week[0].date);
      const year = firstDayOfWeek.getFullYear();
      const month = firstDayOfWeek.getMonth();
      const monthKey = `${year}-${month}`;

      // Label every month that hasn't been labeled yet
      if (!seenMonths.has(monthKey)) {
        labels.push({ label: MONTH_LABELS[month], week: weekIndex });
        seenMonths.add(monthKey);
      }
    });

    return labels;
  }

  if (loading) {
    return <Loading message="Loading chart data..." size="sm" />;
  }

  if (error) {
    return <div className="text-center py-8 text-accent-red">{error}</div>;
  }

  const grid = buildGrid();
  const monthLabels = getMonthLabels(grid);
  const cellSize = 12;
  const cellGap = 3;
  const gridWeeks = grid.length;

  // Check for empty data AFTER building grid so Dropdown is always available
  if (!data || !data.days || data.days.length === 0 || data.max_count === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Dropdown
              options={[
                { value: 'rolling', label: 'Last 12 months' },
                ...years.map((y) => ({ value: String(y), label: String(y) }))
              ]}
              value={typeof viewMode === 'string' ? viewMode : String(viewMode)}
              onChange={(value) => setViewMode(value === 'rolling' ? 'rolling' : parseInt(value))}
              placeholder="Select time range"
              size="sm"
              containerBackground="bg1"
            />
          </div>
        </div>
        <EmptyState message="Not enough data for visualization. Add more applications with different statuses." />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Dropdown
            options={[
              { value: 'rolling', label: 'Last 12 months' },
              ...years.map((y) => ({ value: String(y), label: String(y) }))
            ]}
            value={typeof viewMode === 'string' ? viewMode : String(viewMode)}
            onChange={(value) => setViewMode(value === 'rolling' ? 'rolling' : parseInt(value))}
            placeholder="Select time range"
            size="sm"
            containerBackground="bg1"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: getLevelColor(level) }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="relative" style={{ minWidth: gridWeeks * (cellSize + cellGap) + 30 }}>
          <div className="flex text-xs text-muted mb-1 pl-8">
            {monthLabels.map((m, i) => (
              <span
                key={`${m.label}-${i}`}
                style={{
                  position: 'absolute',
                  left: 30 + m.week * (cellSize + cellGap),
                }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex mt-4">
            <div className="flex flex-col text-xs text-muted pr-2" style={{ marginTop: 0 }}>
              {DAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  style={{ height: cellSize + cellGap, lineHeight: `${cellSize}px` }}
                  className={i % 2 === 1 ? '' : 'invisible'}
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {grid.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[3px]">
                  {week.map((cell, dayIndex) => (
                    <div
                      key={`${weekIndex}-${dayIndex}`}
                      className="rounded-sm transition-all duration-200 ease-in-out cursor-pointer opacity-60 hover:opacity-100"
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: getLevelColor(cell.level),
                        visibility: cell.isPadding ? 'hidden' : 'visible',
                      }}
                      onMouseEnter={() => !cell.isPadding && setHoveredCell(cell)}
                      onMouseLeave={() => setHoveredCell(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {hoveredCell && (
            <div className="absolute top-0 right-0 bg-secondary border border-tertiary rounded px-2 py-1 text-sm">
              <span className="text-primary font-medium">{hoveredCell.count}</span>
              <span className="text-muted ml-1">
                {hoveredCell.count === 1 ? 'application' : 'applications'} on{' '}
              </span>
              <span className="text-primary">{hoveredCell.date}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
