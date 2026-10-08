import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { locale } from '@/lib/i18n';
import { Link } from 'react-router-dom';
import { pillStyle } from '@/lib/uiPills';
export interface CalendarEvent {
  id: string;
  date: string;
  label: string;
  href?: string;
  outcome?: string | null;
}
export interface MonthGridProps {
  month: Date;
  events: CalendarEvent[];
  reminderDates?: string[];
  today?: Date;
  maxEvents?: number;
  headerActions?: ReactNode;
  onMonthChange?: (month: Date) => void;
  onDayClick?: (date: string) => void;
  onEventClick?: (event: CalendarEvent) => void;
}
function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
export default function MonthGrid({
  month,
  events,
  reminderDates = [],
  today = new Date(),
  maxEvents = 2,
  onMonthChange,
  headerActions,
  onDayClick,
  onEventClick,
}: MonthGridProps) {
  const { t } = useTranslation();
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (start.getDay() + 6) % 7;
  const length = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  const days = Array.from(
    { length: Math.ceil((offset + length) / 7) * 7 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1)
  );
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 0, 5 + i).toLocaleDateString(locale(), { weekday: 'short' })
  );
  return (
    <div className="overflow-hidden rounded-lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!onMonthChange}
            aria-label={t('kit.previousMonth')}
            onClick={() =>
              onMonthChange?.(
                new Date(month.getFullYear(), month.getMonth() - 1, 1)
              )
            }
            className="text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer rounded px-2 py-1 focus:ring-2 disabled:opacity-40"
          >
            <i className="bi bi-chevron-left" aria-hidden="true" />
          </button>
          <h3 className="text-fg1 font-semibold">
            {month.toLocaleDateString(locale(), {
              month: 'long',
              year: 'numeric',
            })}
          </h3>
          <button
            type="button"
            disabled={!onMonthChange}
            aria-label={t('kit.nextMonth')}
            onClick={() =>
              onMonthChange?.(
                new Date(month.getFullYear(), month.getMonth() + 1, 1)
              )
            }
            className="text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer rounded px-2 py-1 focus:ring-2 disabled:opacity-40"
          >
            <i className="bi bi-chevron-right" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={!onMonthChange}
            onClick={() =>
              onMonthChange?.(
                new Date(today.getFullYear(), today.getMonth(), 1)
              )
            }
            className="text-accent hover:bg-bg2 focus:ring-accent cursor-pointer rounded px-3 py-1 text-sm focus:ring-2 disabled:opacity-40"
          >
            {t('kit.today')}
          </button>
        </div>
        {headerActions}
      </div>
      <div role="table" aria-label={t('kit.interviewCalendar')}>
        <div role="row" className="mb-1.5 grid grid-cols-7 gap-1.5">
          {weekdays.map((day) => (
            <div
              role="columnheader"
              key={day}
              className="text-fg4 px-1.5 text-xs font-bold uppercase"
            >
              {day}
            </div>
          ))}
        </div>
        {Array.from({ length: days.length / 7 }, (_, week) => (
          <div
            role="row"
            key={week}
            className="mb-1.5 grid grid-cols-7 gap-1.5"
          >
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const key = dateKey(day);
              const items = events.filter((event) => event.date === key);
              const dots = reminderDates.filter((date) => date === key).length;
              return (
                <div
                  role="cell"
                  key={key}
                  aria-label={key}
                  className={`bg-secondary min-h-24 min-w-0 rounded-md p-1.5 ${day.getMonth() !== month.getMonth() ? 'opacity-50' : ''} ${key === dateKey(today) ? 'ring-accent ring-2 ring-inset' : ''}`}
                >
                  <button
                    type="button"
                    aria-current={key === dateKey(today) ? 'date' : undefined}
                    aria-label={day.toLocaleDateString(locale(), {
                      dateStyle: 'full',
                    })}
                    disabled={!onDayClick}
                    onClick={() => onDayClick?.(key)}
                    className="text-fg4 focus:ring-accent mb-2 cursor-pointer rounded px-1 text-xs focus:ring-2 disabled:cursor-default"
                  >
                    {day.getDate()}
                  </button>
                  <div className="space-y-1">
                    {items.slice(0, Math.max(1, maxEvents)).map((event) => {
                      const style = pillStyle(
                        event.outcome === 'passed'
                          ? '--green-bright'
                          : event.outcome === 'failed'
                            ? '--red-bright'
                            : '--orange-bright'
                      );
                      const cls =
                        'focus:ring-accent block w-full truncate rounded px-1.5 py-1 text-left text-xs focus:ring-2';
                      return event.href ? (
                        <Link
                          key={event.id}
                          to={event.href}
                          className={cls}
                          style={style}
                          title={event.label}
                        >
                          {event.label}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          key={event.id}
                          disabled={!onEventClick}
                          onClick={() => onEventClick?.(event)}
                          className={cls}
                          style={style}
                          title={event.label}
                        >
                          {event.label}
                        </button>
                      );
                    })}
                  </div>
                  {items.length > Math.max(1, maxEvents) && (
                    <button
                      type="button"
                      disabled={!onDayClick}
                      onClick={() => onDayClick?.(key)}
                      className="text-accent focus:ring-accent mt-1 cursor-pointer rounded text-xs focus:ring-2"
                    >
                      {t('kit.moreEvents', {
                        count: items.length - Math.max(1, maxEvents),
                      })}
                    </button>
                  )}
                  {dots > 0 && (
                    <div
                      aria-label={t('kit.remindersOnDay', { count: dots })}
                      className="mt-2 flex gap-1"
                    >
                      {Array.from({ length: Math.min(dots, 3) }, (_, i) => (
                        <span
                          key={i}
                          className="bg-yellow-bright h-1.5 w-1.5 rounded-full"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-fg4 mt-3 text-xs">{t('kit.calendarLegend')}</p>
    </div>
  );
}
