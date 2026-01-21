import { useEffect, useState } from 'react';
import { getHeatmapData } from '../lib/analytics';
import type { HeatmapData } from '../lib/analytics';

const DAYS_IN_WEEK = 7;
const WEEKS_TO_SHOW = 53;
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
  const [year, setYear] = useState(new Date().getFullYear());
  const [hoveredCell, setHoveredCell] = useState<CellData | null>(null);

  useEffect(() => {
    loadData();
  }, [year]);

  async function loadData() {
    setLoading(true);
    try {
      const result = await getHeatmapData(year);
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
      case 0:
        return 'var(--bg-tertiary)';
      case 1:
        return 'var(--accent-green)';
      case 2:
        return 'var(--accent-aqua)';
      case 3:
        return 'var(--accent-blue)';
      case 4:
        return 'var(--accent-purple)';
      default:
        return 'var(--bg-tertiary)';
    }
  }

  function buildGrid(): CellData[][] {
    const grid: CellData[][] = [];
    const countMap = new Map<string, number>();

    if (data && data.days) {
      data.days.forEach((d) => countMap.set(d.date, d.count));
    }

    const startDate = new Date(year, 0, 1);
    const startDay = startDate.getDay();
    const firstSunday = new Date(startDate);
    firstSunday.setDate(firstSunday.getDate() - startDay);

    for (let week = 0; week < WEEKS_TO_SHOW; week++) {
      const weekData: CellData[] = [];
      for (let day = 0; day < DAYS_IN_WEEK; day++) {
        const cellDate = new Date(firstSunday);
        cellDate.setDate(cellDate.getDate() + week * 7 + day);
        const dateStr = cellDate.toISOString().split('T')[0];
        const count = countMap.get(dateStr) || 0;
        const level = getLevel(count, data?.max_count ?? 0);
        weekData.push({ date: dateStr, count, level });
      }
      grid.push(weekData);
    }

    return grid;
  }

  function getMonthLabels(grid: CellData[][]): { label: string; week: number }[] {
    const labels: { label: string; week: number }[] = [];
    let lastMonth = -1;

    grid.forEach((week, weekIndex) => {
      const firstDayOfWeek = new Date(week[0].date);
      const month = firstDayOfWeek.getMonth();
      if (month !== lastMonth && firstDayOfWeek.getFullYear() === year) {
        labels.push({ label: MONTH_LABELS[month], week: weekIndex });
        lastMonth = month;
      }
    });

    return labels;
  }

  if (loading) {
    return <div className="text-center py-8 text-muted">Loading activity data...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-accent-red">{error}</div>;
  }

  const grid = buildGrid();
  const monthLabels = getMonthLabels(grid);
  const cellSize = 12;
  const cellGap = 3;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(year - 1)}
            className="px-2 py-1 bg-tertiary text-primary rounded hover:bg-muted text-sm"
          >
            &larr;
          </button>
          <span className="text-primary font-medium">{year}</span>
          <button
            onClick={() => setYear(year + 1)}
            disabled={year >= new Date().getFullYear()}
            className="px-2 py-1 bg-tertiary text-primary rounded hover:bg-muted text-sm disabled:opacity-50"
          >
            &rarr;
          </button>
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
        <div className="relative" style={{ minWidth: WEEKS_TO_SHOW * (cellSize + cellGap) + 30 }}>
          <div className="flex text-xs text-muted mb-1 pl-8">
            {monthLabels.map((m) => (
              <span
                key={m.week}
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
                      className="rounded-sm cursor-pointer transition-opacity hover:opacity-80"
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
