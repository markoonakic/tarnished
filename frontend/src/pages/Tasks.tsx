import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import SegmentedControl from '@/components/SegmentedControl';
import MonthGrid from '@/components/MonthGrid';
import EmptyState from '@/components/EmptyState';
export default function Tasks() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(new Date());
  const interviews = params.get('view') === 'interviews';
  const week = params.get('calendar') === 'week';
  const filter = params.get('state') ?? 'open';
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }
  return (
    <Layout>
      <div
        className={
          interviews
            ? 'mx-auto max-w-6xl px-4 py-8'
            : 'mx-auto max-w-4xl px-4 py-8'
        }
      >
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-primary text-2xl font-bold">{t('kit.tasks')}</h1>
          <button
            type="button"
            disabled
            className="bg-accent text-bg0 rounded-md px-4 py-2 font-medium opacity-50"
          >
            {t('kit.newReminder')}
          </button>
        </div>
        <div className="-mt-2 mb-6">
          <SegmentedControl
            label={t('kit.tasks')}
            value={interviews ? 'interviews' : 'todo'}
            options={[
              { value: 'todo', label: t('kit.toDo') },
              { value: 'interviews', label: t('kit.interviews') },
            ]}
            onChange={(tab) => update('view', tab)}
          />
        </div>
        {interviews ? (
          <>
            {week && (
              <div className="mb-4 hidden justify-end sm:flex">
                <SegmentedControl
                  label={t('kit.interviewCalendar')}
                  value={week ? 'week' : 'month'}
                  options={[
                    { value: 'month', label: t('kit.month') },
                    { value: 'week', label: t('kit.week') },
                  ]}
                  onChange={(view) => update('calendar', view)}
                />
              </div>
            )}
            {!week && (
              <div className="hidden sm:block">
                <MonthGrid
                  month={month}
                  events={[]}
                  headerActions={
                    <SegmentedControl
                      label={t('kit.interviewCalendar')}
                      value="month"
                      options={[
                        { value: 'month', label: t('kit.month') },
                        { value: 'week', label: t('kit.week') },
                      ]}
                      onChange={(view) => update('calendar', view)}
                    />
                  }
                  onMonthChange={setMonth}
                  onDayClick={(date) => {
                    const next = new URLSearchParams(params);
                    next.set('calendar', 'week');
                    next.set('date', date);
                    setParams(next);
                  }}
                />
              </div>
            )}
            <div className={week ? '' : 'sm:hidden'}>
              <EmptyState message={t('kit.noInterviews')} icon="bi-calendar" />
            </div>
          </>
        ) : (
          <>
            <div className="bg-bg1 mb-6 rounded-lg p-4">
              <SegmentedControl
                label={t('kit.reminders')}
                value={filter}
                options={[
                  { value: 'open', label: t('kit.open') },
                  { value: 'done', label: t('kit.done') },
                  { value: 'all', label: t('kit.all') },
                ]}
                onChange={(state) => update('state', state)}
              />
            </div>
            <EmptyState message={t('kit.noTasks')} icon="bi-bell" />
          </>
        )}
      </div>
    </Layout>
  );
}
