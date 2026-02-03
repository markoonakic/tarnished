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
    // Reset today to midnight for consistent comparison
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    let endDate: Date;

    if (viewMode === 'rolling') {
      // GitHub's algorithm: go back 365 days, then find Sunday on or before that date
      const lookbackDate = new Date(today);
      lookbackDate.setDate(today.getDate() - 365);

      // Find the Sunday on or before the lookback date
      const dayOfWeek = lookbackDate.getDay(); // 0 = Sunday, 6 = Saturday
      startDate = new Date(lookbackDate);
      startDate.setDate(lookbackDate.getDate() - dayOfWeek);

      // End date is today (don't show future dates)
      endDate = new Date(today);
    } else {
      // Year view: Calculate exact weeks needed to cover the year
      // Start: Sunday before Jan 1 of the selected year
      const yearStartDate = new Date(viewMode, 0, 1);
      const startDay = yearStartDate.getDay();
      startDate = new Date(yearStartDate);
      startDate.setDate(yearStartDate.getDate() - startDay); // Go to Sunday before Jan 1

      // End: Saturday after Dec 31 of the selected year (for complete week coverage)
      const yearEndDate = new Date(viewMode, 11, 31);
      const endDay = yearEndDate.getDay();
      endDate = new Date(yearEndDate);
      endDate.setDate(yearEndDate.getDate() + (6 - endDay)); // Go to Saturday after Dec 31

      // If we're currently in this year, cap at today instead of extending to next year
      if (viewMode === today.getFullYear() && endDate > today) {
        endDate = new Date(today);
      }
    }

    // Calculate exact number of weeks needed
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const weeksToShow = Math.ceil(daysDiff / 7);

    for (let week = 0; week < weeksToShow; week++) {
      const weekData: CellData[] = [];
      for (let day = 0; day < DAYS_IN_WEEK; day++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(cellDate.getDate() + week * 7 + day);
        cellDate.setHours(0, 0, 0, 0);

        // Only include cells that are within our valid date range
        if (cellDate <= endDate) {
          const dateStr = cellDate.toLocaleDateString('en-CA'); // Canadian locale uses YYYY-MM-DD format
          const count = countMap.get(dateStr) || 0;
          const level = getLevel(count, data?.max_count ?? 0);
          weekData.push({ date: dateStr, count, level });
        }
        // Don't push placeholder cells - let weeks have variable lengths
      }
      grid.push(weekData);
    }

    return grid;
  }

  function getMonthLabels(grid: CellData[][]): { label: string; week: number }[] {
    const labels: { label: string; week: number }[] = [];
    let lastMonth = -1;
    let lastLabelWeek = -1;
    const MIN_WEEKS_BETWEEN_LABELS = 3; // 3 weeks * 15px = 45px minimum spacing

    grid.forEach((week, weekIndex) => {
      // Skip empty weeks (can happen with variable-length weeks)
      if (week.length === 0) return;

      const firstDayOfWeek = new Date(week[0].date);
      const month = firstDayOfWeek.getMonth();

      // Only add label if:
      // 1. Month changed from previous label, AND
      // 2. At least MIN_WEEKS_BETWEEN_LABELS weeks since last label
      if (month !== lastMonth && weekIndex - lastLabelWeek >= MIN_WEEKS_BETWEEN_LABELS) {
        labels.push({ label: MONTH_LABELS[month], week: weekIndex });
        lastMonth = month;
        lastLabelWeek = weekIndex;
      } else if (month !== lastMonth) {
        // Month changed but too close to last label - just update lastMonth
        lastMonth = month;
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
                      }}
                      onMouseEnter={() => setHoveredCell(cell)}
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
